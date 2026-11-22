//! GET /goal - parameter parsing, SVG/PNG generation and response shaping,
//! mirroring src/app/goal/route.ts request-for-request.

use axum::body::Body;
use axum::extract::RawQuery;
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::Response;
use base64::Engine;
use chrono::{Datelike, NaiveDate};
use std::sync::Arc;

use crate::jsnum::{js_parse_float, js_parse_int};
use crate::query::{cache_key, Query};
use crate::state::AppState;
use crate::svg::{generate_svg, GoalConfig};

/// The Next.js `vary` header emitted for route-handler responses. Kept for
/// contract parity with the reference image.
pub const VARY_RSC: &str = "rsc, next-router-state-tree, next-router-prefetch, next-router-segment-prefetch";

/// JS `new Date(s).getTime()` for the formats this app can produce.
/// Date-only ISO strings parse as UTC midnight (ECMAScript); naive ISO
/// datetimes are treated as UTC because the reference container runs with
/// TZ unset. Returns None (NaN) for anything unparseable.
pub fn js_date_ms(s: &str) -> Option<f64> {
    let naive_midnight = |y: i32, m: u32, d: u32| -> Option<f64> {
        Some(
            NaiveDate::from_ymd_opt(y, m, d)?
                .and_hms_opt(0, 0, 0)?
                .and_utc()
                .timestamp_millis() as f64,
        )
    };
    let b = s.as_bytes();
    let all_digits = |x: &[u8]| x.iter().all(|c| c.is_ascii_digit());
    match b.len() {
        10 if b[4] == b'-' && b[7] == b'-'
            && all_digits(&b[0..4]) && all_digits(&b[5..7]) && all_digits(&b[8..10]) =>
        {
            let y: i32 = s[0..4].parse().ok()?;
            let m: u32 = s[5..7].parse().ok()?;
            let d: u32 = s[8..10].parse().ok()?;
            naive_midnight(y, m, d)
        }
        7 if b[4] == b'-' && all_digits(&b[0..4]) && all_digits(&b[5..7]) => {
            let y: i32 = s[0..4].parse().ok()?;
            let m: u32 = s[5..7].parse().ok()?;
            naive_midnight(y, m, 1)
        }
        4 if all_digits(b) => {
            let y: i32 = s.parse().ok()?;
            naive_midnight(y, 1, 1)
        }
        _ => {
            // full ISO datetime with explicit zone
            if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(s) {
                return Some(dt.timestamp_millis() as f64);
            }
            // naive ISO datetime -> UTC (reference container has TZ=UTC)
            for fmt in ["%Y-%m-%dT%H:%M:%S%.f", "%Y-%m-%dT%H:%M"] {
                if let Ok(dt) = chrono::NaiveDateTime::parse_from_str(s, fmt) {
                    return Some(dt.and_utc().timestamp_millis() as f64);
                }
            }
            None
        }
    }
}

/// "Now" with hours zeroed, like `const now = new Date(); now.setHours(0,0,0,0)`
/// in the UTC-based reference container.
pub fn now_midnight_utc_ms() -> f64 {
    let now = chrono::Utc::now().naive_utc();
    NaiveDate::from_ymd_opt(now.year(), now.month(), now.day())
        .expect("valid today")
        .and_hms_opt(0, 0, 0)
        .expect("valid midnight")
        .and_utc()
        .timestamp_millis() as f64
}

fn get_or<'a>(q: &'a Query, key: &str, default: &'a str) -> &'a str {
    // JS: `searchParams.get(key) || default` - empty string is falsy too.
    match q.get(key) {
        Some(v) if !v.is_empty() => v,
        _ => default,
    }
}

pub fn parse_params(q: &Query, now_ms: f64) -> GoalConfig {
    // JS reads goalColor as `get('goal_color') || currentColor` - resolve the
    // dependency order here.
    let current_color = get_or(q, "current_color", "#ff6b35").to_string();
    GoalConfig {
        start_ms: js_date_ms(get_or(q, "start_date", "2000-01-01")).unwrap_or(f64::NAN),
        end_ms: js_date_ms(get_or(q, "end_date", "2080-01-01")).unwrap_or(f64::NAN),
        now_ms,
        width: js_parse_int(get_or(q, "width", "1290")).unwrap_or(f64::NAN),
        height: js_parse_int(get_or(q, "height", "2796")).unwrap_or(f64::NAN),
        offset_top: js_parse_float(get_or(q, "offset_top", "0")).unwrap_or(f64::NAN),
        offset_bottom: js_parse_float(get_or(q, "offset_bottom", "0")).unwrap_or(f64::NAN),
        offset_left: js_parse_float(get_or(q, "offset_left", "0")).unwrap_or(f64::NAN),
        offset_right: js_parse_float(get_or(q, "offset_right", "0")).unwrap_or(f64::NAN),
        goal_text_top_offset: js_parse_float(get_or(q, "goal_text_top_offset", "0")).unwrap_or(f64::NAN),
        // absent -> 1 (JS `=== null` check); present-but-garbage -> NaN
        ring_style: match q.get("ring_style") {
            None => 1.0,
            Some(v) => js_parse_int(v).unwrap_or(f64::NAN),
        },
        dot_scale: match q.get("dot_scale") {
            None => 1.0,
            Some(v) => js_parse_float(v).unwrap_or(f64::NAN),
        },
        show_text: q.get("show_text").map(|v| v != "0").unwrap_or(true),
        elapsed_mode: q.get("elapsed_mode") == Some("true"),
        has_widgets: q.get("has_widgets") == Some("true"),
        goal_text: get_or(q, "goal_text", "").to_string(),
        bg_color: get_or(q, "bg_color", "#1a1a1a").to_string(),
        past_color: get_or(q, "past_color", "#ffffff").to_string(),
        current_color: current_color.clone(),
        future_color: get_or(q, "future_color", "#2a2a2a").to_string(),
        goal_color: get_or(q, "goal_color", &current_color).to_string(),
    }
}

pub async fn goal_handler(
    axum::extract::State(state): axum::extract::State<Arc<AppState>>,
    RawQuery(raw): RawQuery,
    headers: HeaderMap,
) -> Response {
    let q = Query::parse(raw.as_deref());
    let format = get_or(&q, "format", "png").to_string();
    let html = q.get("html") == Some("true");

    // Track image generation (only for downloads, not previews)
    if format != "svg" {
        let ua = headers
            .get(header::USER_AGENT)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_string();
        state.stats.track_image_generation(&ua);
    }

    let key = cache_key(&q);

    if format == "svg" {
        if let Some(cached) = state.svg_cache.lock().unwrap().get(&key) {
            return svg_response(cached, "HIT");
        }
    }

    let cfg = parse_params(&q, now_midnight_utc_ms());
    let svg = generate_svg(&cfg);

    if format == "svg" {
        state.svg_cache.lock().unwrap().set(key, svg.clone());
        return svg_response(svg, "MISS");
    }

    // Rasterize off the async executor (5375x11650 renders take a while).
    let png = {
        let svg = svg.clone();
        match tokio::task::spawn_blocking(move || render_png(&state.fontdb, &svg)).await {
            Ok(Ok(png)) => png,
            _ => {
                return Response::builder()
                    .status(StatusCode::INTERNAL_SERVER_ERROR)
                    .body(Body::empty())
                    .unwrap();
            }
        }
    };

    if html {
        let b64 = base64::engine::general_purpose::STANDARD.encode(&png);
        let html_content = format!(
            "\n      <!DOCTYPE html>\n      <html lang=\"en\">\n      <head>\n        <meta charset=\"UTF-8\">\n        <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n        <title>Until Wall - Life Calendar</title>\n        <style>\n          * {{\n            margin: 0;\n            padding: 0;\n            box-sizing: border-box;\n          }}\n          body {{\n            min-height: 100vh;\n            display: flex;\n            justify-content: center;\n            align-items: center;\n            background-color: #1a1a1a;\n          }}\n          img {{\n            max-width: 100vw;\n            max-height: 100vh;\n            object-fit: contain;\n          }}\n        </style>\n      </head>\n      <body>\n        <img src=\"data:image/png;base64,{b64}\" alt=\"Life Calendar\" />\n      </body>\n      </html>\n    "
        );
        return Response::builder()
            .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
            .header(header::CACHE_CONTROL, "no-store, no-cache, must-revalidate")
            .header(header::VARY, VARY_RSC)
            .body(Body::from(html_content))
            .unwrap();
    }

    Response::builder()
        .header(header::CONTENT_TYPE, "image/png")
        .header(
            header::CONTENT_DISPOSITION,
            "inline; filename=\"untilwall.png\"",
        )
        .header(header::CACHE_CONTROL, "no-store, no-cache, must-revalidate")
        .header(header::PRAGMA, "no-cache")
        .header(header::EXPIRES, "0")
        .header("x-robots-tag", "noindex, nofollow, nosnippet")
        .header("x-content-type-options", "nosniff")
        .header(header::VARY, VARY_RSC)
        .body(Body::from(png))
        .unwrap()
}

fn svg_response(svg: String, cache_status: &str) -> Response {
    Response::builder()
        .header(header::CONTENT_TYPE, "image/svg+xml")
        .header(header::CACHE_CONTROL, "public, max-age=300")
        .header("x-cache", cache_status)
        .header("x-robots-tag", "noindex, nofollow, nosnippet")
        .header(header::VARY, VARY_RSC)
        .body(Body::from(svg))
        .unwrap()
}

/// sharp(Buffer.from(svg), { density: 300 }) equivalent: resvg at scale
/// 300/72 with pixel dimensions rounded half-up like librsvg does.
pub fn render_png(fontdb: &Arc<usvg::fontdb::Database>, svg_str: &str) -> Result<Vec<u8>, String> {
    let mut opts = usvg::Options::default();
    opts.fontdb = fontdb.clone();
    let tree = usvg::Tree::from_str(svg_str, &opts).map_err(|e| format!("svg parse: {e}"))?;
    let scale = 300.0f64 / 72.0;
    let size = tree.size();
    let w = ((size.width() as f64) * scale).round().max(1.0) as u32;
    let h = ((size.height() as f64) * scale).round().max(1.0) as u32;
    let mut pixmap = tiny_skia::Pixmap::new(w, h).ok_or_else(|| "pixmap alloc".to_string())?;
    let transform = usvg::Transform::from_scale(scale as f32, scale as f32);
    resvg::render(&tree, transform, &mut pixmap.as_mut());
    pixmap.encode_png().map_err(|e| format!("png encode: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn date_parsing() {
        assert_eq!(js_date_ms("2000-01-01"), Some(946684800000.0));
        // 2026-11-22 = (20454 days to 2026-01-01 + 325) * 86400000
        assert_eq!(js_date_ms("2026-11-22"), Some(1795305600000.0));
        assert_eq!(js_date_ms("2026-02-30"), None); // invalid day
        assert_eq!(js_date_ms("2026-13-01"), None); // invalid month
        assert_eq!(js_date_ms("garbage"), None);
        assert_eq!(js_date_ms("2026"), Some(1767225600000.0)); // year only
        // date-only + explicit zone keep their exact millis
        assert_eq!(js_date_ms("2026-11-22T12:00:00Z"), Some(1795348800000.0));
    }

    #[test]
    fn day_boundary_math() {
        // 2026-01-01 -> 2026-12-31 = 364 days span + 1 = 365 total
        let start = js_date_ms("2026-01-01").unwrap();
        let end = js_date_ms("2026-12-31").unwrap();
        let total = ((end - start) / 86_400_000.0).floor() + 1.0;
        assert_eq!(total, 365.0);
    }
}

//! Until Wall Rust backend.
//!
//! Serves the same contract as the Next.js image:
//!   GET  /goal          wallpaper generator (svg/png/html)
//!   GET  /api/health    liveness probe
//!   POST /api/visit     visitor tracking
//!   GET  /api/stats     public stats counters
//!   GET  /*             exported static UI (with 404.html fallback)

use axum::body::Body;
use axum::extract::State;
use axum::http::{header, HeaderMap};
use axum::response::Response;
use axum::routing::{get, post};
use axum::Router;
use chrono::Offset as _;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use untilwall::cache::SvgCache;
use untilwall::goal::{self, VARY_RSC};
use untilwall::state::AppState;
use untilwall::static_files::StaticService;
use untilwall::stats;

fn env_or(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_string())
}

fn json_response(body: String) -> Response {
    Response::builder()
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::VARY, VARY_RSC)
        .body(Body::from(body))
        .unwrap()
}

async fn health() -> Response {
    json_response(format!(
        "{{\"status\":\"ok\",\"timestamp\":\"{}\"}}",
        stats::iso_now()
    ))
}

async fn visit(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> Response {
    // JS: body.visitorId || cookie visitor_id || crypto.randomUUID()
    let parsed: serde_json::Value = serde_json::from_slice(&body).unwrap_or(serde_json::json!({}));
    let from_body = parsed
        .get("visitorId")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());

    let from_cookie = headers
        .get(header::COOKIE)
        .and_then(|v| v.to_str().ok())
        .and_then(|cookies| {
            cookies.split(';').find_map(|c| {
                let c = c.trim();
                c.strip_prefix("visitor_id=").map(|v| v.to_string())
            })
        })
        .filter(|s| !s.is_empty());

    let visitor_id = from_body
        .or(from_cookie)
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    state.stats.track_visitor(&visitor_id);

    json_response(format!(
        "{{\"success\":true,\"visitorId\":\"{}\"}}",
        escape_json_string(&visitor_id)
    ))
}

fn escape_json_string(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out
}

async fn stats_endpoint(State(state): State<Arc<AppState>>) -> Response {
    json_response(state.stats.public_stats().to_string())
}

async fn static_fallback(State(state): State<Arc<AppState>>, req: axum::extract::Request) -> Response {
    let path = req.uri().path().to_string();
    state.static_service.serve(&path).await
}

/// Resolve the container-level default timezone offset from the TZ env.
/// Accepts an IANA zone name ("Europe/Moscow", DST-aware via chrono-tz) or
/// a bare signed number of hours ("+3", "-5"). Unset/UTC/unknown -> 0.
fn resolve_default_tz_ms() -> f64 {
    const HOUR: f64 = 3_600_000.0;
    let tz = std::env::var("TZ").unwrap_or_default();
    let tz = tz.trim();
    if tz.is_empty() || tz == "UTC" || tz == "GMT" {
        return 0.0;
    }
    if let Ok(h) = tz.parse::<f64>() {
        if (-12.0..=14.0).contains(&h) {
            return h * HOUR;
        }
    }
    if let Ok(zone) = tz.parse::<chrono_tz::Tz>() {
        let seconds = chrono::Utc::now()
            .with_timezone(&zone)
            .offset()
            .fix()
            .local_minus_utc();
        return seconds as f64 * 1000.0;
    }
    eprintln!("untilwall: unrecognized TZ='{tz}', defaulting to UTC");
    0.0
}

#[tokio::main]
async fn main() {
    let port = env_or("PORT", "3000");
    let data_dir = PathBuf::from(env_or("DATA_DIR", "data"));
    let static_dir = PathBuf::from(env_or("STATIC_DIR", "static"));
    let default_tz_offset_ms = resolve_default_tz_ms();

    let mut fontdb = usvg::fontdb::Database::new();
    fontdb.load_system_fonts();

    let state = Arc::new(AppState {
        svg_cache: Mutex::new(SvgCache::new(200, 60)),
        stats: stats::Stats::new(&data_dir),
        fontdb: Arc::new(fontdb),
        static_service: StaticService::new(&static_dir),
        default_tz_offset_ms,
    });

    let app = Router::new()
        .route("/goal", get(goal::goal_handler))
        .route("/api/health", get(health))
        .route("/api/visit", post(visit))
        .route("/api/stats", get(stats_endpoint))
        .fallback(static_fallback)
        .with_state(state);

    let addr = format!("0.0.0.0:{port}");
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .unwrap_or_else(|e| panic!("cannot bind {addr}: {e}"));
    eprintln!(
        "untilwall listening on {addr} (static: {}, data: {}, default tz offset: {}h)",
        static_dir.display(),
        data_dir.display(),
        default_tz_offset_ms / 3_600_000.0
    );
    axum::serve(listener, app).await.unwrap();
}

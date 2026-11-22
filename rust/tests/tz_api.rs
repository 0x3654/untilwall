//! Timezone integration tests: drive the real router with an injected clock
//! and a chosen default offset, no I/O against the outside world.

use axum::body::Body;
use axum::http::{Request, Response};
use http_body_util::BodyExt;
use tower::ServiceExt;

use untilwall::cache::SvgCache;
use untilwall::server::build_router;
use untilwall::state::AppState;
use untilwall::static_files::StaticService;
use untilwall::stats::Stats;

fn fixed_instant(iso: &str) -> f64 {
    untilwall::goal::js_date_ms(iso).expect("valid test instant")
}

/// AppState with a fixed clock and the given default tz offset (hours).
fn test_state(now_iso: &str, default_tz_hours: f64) -> std::sync::Arc<AppState> {
    let now = fixed_instant(now_iso);
    let data_dir = std::env::temp_dir().join(format!(
        "untilwall-tz-test-{}-{:x}",
        std::process::id(),
        now as u64 ^ (default_tz_hours as u64) << 8
    ));
    std::sync::Arc::new(AppState {
        svg_cache: std::sync::Mutex::new(SvgCache::new(200, 60)),
        stats: Stats::new(&data_dir),
        fontdb: std::sync::Arc::new(usvg::fontdb::Database::new()),
        static_service: StaticService::new(data_dir.join("static")),
        default_tz_offset_ms: default_tz_hours * 3_600_000.0,
        now_source: Box::new(move || now),
        render_semaphore: std::sync::Arc::new(tokio::sync::Semaphore::new(2)),
        render_density: 300.0,
    })
}

async fn get(state: &std::sync::Arc<AppState>, query: &str) -> Response<Body> {
    build_router(state.clone())
        .oneshot(Request::builder().uri(format!("/goal?{query}")).body(Body::empty()).unwrap())
        .await
        .unwrap()
}

async fn body_bytes(resp: Response<Body>) -> Vec<u8> {
    resp.into_body().collect().await.unwrap().to_bytes().to_vec()
}

/// "Nd until" from the bottom text = days REMAINING (totalDays - daysPassed).
fn days_left(svg: &[u8]) -> i64 {
    let text = std::str::from_utf8(svg).expect("svg is utf8");
    const MARK: &str = "<tspan fill=\"#ff6b35\">";
    let m = text.match_indices(MARK).find_map(|(i, _)| {
        let rest = &text[i + MARK.len()..];
        let end = rest.find("</tspan>")?;
        let seg = &rest[..end];
        seg.strip_suffix("d until").and_then(|n| n.parse::<i64>().ok())
    });
    m.expect("bottom text tspan found")
}

/// Query suffix defeating the SVG cache per request when needed.
const BASE: &str = "start_date=2026-11-01&end_date=2026-11-30&format=svg&width=1290&height=2796";

#[tokio::test]
async fn tz_param_shifts_day_boundary_at_moscow_midnight() {
    // 2026-11-22T21:30Z: Moscow (Nov 23) has already rolled over, UTC has not.
    // Range Nov 1..30 (30 days): UTC is on day 22 -> 8 left; MSK day 23 -> 7 left.
    let state = test_state("2026-11-22T21:30:00Z", 0.0);
    let utc = body_bytes(get(&state, &format!("{BASE}&tz=0")).await).await;
    let msk = body_bytes(get(&state, &format!("{BASE}&tz=%2B3&uniq=1")).await).await;
    assert_eq!(days_left(&utc), 8, "UTC: Nov 22 is day 22 of 30");
    assert_eq!(days_left(&msk), 7, "MSK: Nov 23 is day 23 of 30");
    assert_ne!(utc, msk);
}

#[tokio::test]
async fn tz_zero_matches_plain_utc_midnights() {
    // local_midnight with a zero offset is the plain UTC date truncation
    let now_local = untilwall::goal::local_midnight(fixed_instant("2026-11-22T21:30:00Z"), 0.0);
    assert_eq!(now_local, fixed_instant("2026-11-22T00:00:00Z"));
}

#[tokio::test]
async fn default_offset_applies_when_tz_absent() {
    let state = test_state("2026-11-22T21:30:00Z", 3.0);
    let none = body_bytes(get(&state, BASE).await).await;
    let explicit = body_bytes(get(&state, &format!("{BASE}&tz=%2B3&uniq=2")).await).await;
    assert_eq!(none, explicit, "no-param must equal explicit container offset");
    assert_eq!(days_left(&none), 7, "MSK: day 23 of 30");
}

#[tokio::test]
async fn utc_default_keeps_reference_parity() {
    // The golden invariant at HTTP level: default 0 == explicit tz=0.
    let state = test_state("2026-11-22T21:30:00Z", 0.0);
    let none = body_bytes(get(&state, BASE).await).await;
    let zero = body_bytes(get(&state, &format!("{BASE}&tz=0&uniq=3")).await).await;
    assert_eq!(none, zero);
}

#[tokio::test]
async fn invalid_tz_falls_back_to_container_default() {
    let state = test_state("2026-11-22T21:30:00Z", 3.0);
    let garbage = body_bytes(get(&state, &format!("{BASE}&tz=garbage")).await).await;
    let reference = body_bytes(get(&state, &format!("{BASE}&uniq=4")).await).await;
    assert_eq!(garbage, reference);
    let out_of_range = body_bytes(get(&state, &format!("{BASE}&tz=%2B15&uniq=5")).await).await;
    assert_eq!(out_of_range, reference);
}

#[tokio::test]
async fn fractional_and_extreme_offsets() {
    // 2026-11-22T19:00Z: UTC is Nov 22, +5.5 local is Nov 23 00:30.
    let state = test_state("2026-11-22T19:00:00Z", 0.0);
    let utc = body_bytes(get(&state, &format!("{BASE}&tz=0")).await).await;
    let india = body_bytes(get(&state, &format!("{BASE}&tz=%2B5.5&uniq=6")).await).await;
    assert_eq!(days_left(&utc), 8, "UTC day 22 of 30");
    assert_eq!(days_left(&india), 7, "+5.5 rolls to Nov 23");

    // extremes: -12 is still Nov 22, +14 is Nov 23
    let west = body_bytes(get(&state, &format!("{BASE}&tz=-12&uniq=7")).await).await;
    let east = body_bytes(get(&state, &format!("{BASE}&tz=%2B14&uniq=8")).await).await;
    assert_eq!(days_left(&west), 8);
    assert_eq!(days_left(&east), 7);
}

#[tokio::test]
async fn tz_participates_in_svg_cache_key() {
    let state = test_state("2026-11-22T21:30:00Z", 0.0);
    let q = "start_date=2026-05-01&end_date=2026-05-31&format=svg&cachekey=shared";
    let r1 = get(&state, &format!("{q}&tz=0")).await;
    let r2 = get(&state, &format!("{q}&tz=0")).await;
    let r3 = get(&state, &format!("{q}&tz=%2B3")).await;
    let h = |r: &Response<Body>, name: &str| {
        r.headers()
            .get(name)
            .and_then(|v| v.to_str().ok())
            .unwrap_or_default()
            .to_string()
    };
    assert_eq!(h(&r1, "x-cache"), "MISS");
    assert_eq!(h(&r2, "x-cache"), "HIT");
    assert_eq!(h(&r3, "x-cache"), "MISS", "different tz must be a different key");
}

#[tokio::test]
async fn health_reports_default_offset() {
    let state = test_state("2026-11-22T21:30:00Z", 3.0);
    let resp = build_router(state.clone())
        .oneshot(Request::builder().uri("/api/health").body(Body::empty()).unwrap())
        .await
        .unwrap();
    let body = String::from_utf8(body_bytes(resp).await).unwrap();
    assert!(body.contains("\"status\":\"ok\""), "body: {body}");
    assert!(body.contains("\"defaultTzOffset\":3"), "body: {body}");

    // fractional container offsets print without trailing zeros
    let state = test_state("2026-11-22T21:30:00Z", 5.5);
    let resp = build_router(state)
        .oneshot(Request::builder().uri("/api/health").body(Body::empty()).unwrap())
        .await
        .unwrap();
    let body = String::from_utf8(body_bytes(resp).await).unwrap();
    assert!(body.contains("\"defaultTzOffset\":5.5"), "body: {body}");
}

#[tokio::test]
async fn date_only_strings_repin_to_local_midnight() {
    // start_date must shift by the offset exactly like setHours in that zone:
    // with tz=+3 a range starting today ends "today" from Moscow's view.
    let state = test_state("2026-11-22T21:30:00Z", 3.0);
    let svg = body_bytes(
        get(&state, "start_date=2026-11-22&end_date=2026-11-23&format=svg&width=1290&height=2796&uniq=9")
            .await,
    )
    .await;
    // MSK date is Nov 23: both days passed -> 0d until, 100.0%
    assert_eq!(days_left(&svg), 0);
    let text = std::str::from_utf8(&svg).unwrap();
    assert!(text.contains(" 100.0%"), "percentage for day 2/2");
}

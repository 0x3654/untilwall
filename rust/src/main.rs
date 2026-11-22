//! Until Wall Rust backend - entrypoint.
//! All routing lives in untilwall::server::build_router.

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use chrono::Offset as _;
use untilwall::cache::SvgCache;
use untilwall::goal;
use untilwall::server::build_router;
use untilwall::state::AppState;
use untilwall::static_files::StaticService;
use untilwall::stats;

fn env_or(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_string())
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
    let render_concurrency: usize = env_or("RENDER_CONCURRENCY", "2")
        .parse()
        .ok()
        .filter(|n| *n >= 1)
        .unwrap_or(2);
    let render_density: f64 = env_or("RENDER_DENSITY", "300")
        .parse()
        .ok()
        .filter(|d| (18.0..=600.0).contains(d)) // 72 = native size, 300 = reference parity
        .unwrap_or(300.0);

    let mut fontdb = usvg::fontdb::Database::new();
    fontdb.load_system_fonts();

    let state = Arc::new(AppState {
        svg_cache: Mutex::new(SvgCache::new(200, 60)),
        stats: stats::Stats::new(&data_dir),
        fontdb: Arc::new(fontdb),
        static_service: StaticService::new(&static_dir),
        default_tz_offset_ms,
        now_source: Box::new(goal::now_utc_ms),
        render_semaphore: Arc::new(tokio::sync::Semaphore::new(render_concurrency)),
        render_density,
    });

    let app = build_router(state);

    let addr = format!("0.0.0.0:{port}");
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .unwrap_or_else(|e| panic!("cannot bind {addr}: {e}"));
    eprintln!(
        "untilwall listening on {addr} (static: {}, data: {}, default tz offset: {}h, render concurrency: {render_concurrency}, density: {render_density})",
        static_dir.display(),
        data_dir.display(),
        default_tz_offset_ms / 3_600_000.0
    );
    axum::serve(listener, app).await.unwrap();
}

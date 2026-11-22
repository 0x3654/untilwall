//! Shared application state.

use crate::cache::SvgCache;
use crate::static_files::StaticService;
use crate::stats::Stats;
use std::sync::{Arc, Mutex};

pub struct AppState {
    pub svg_cache: Mutex<SvgCache>,
    pub stats: Stats,
    pub fontdb: Arc<usvg::fontdb::Database>,
    pub static_service: StaticService,
    /// Default UTC offset (ms) for requests without an explicit `tz` param,
    /// resolved once at startup from the TZ env (IANA name or bare number).
    pub default_tz_offset_ms: f64,
    /// Clock source: real `now` in production, a fixed instant in tests.
    pub now_source: Box<dyn Fn() -> f64 + Send + Sync>,
    /// Bounds concurrent PNG rasterizations: one density-300 render peaks at
    /// ~500 MB RSS (a full 5375x11650 pixmap plus scratch), so unbounded
    /// parallelism would spike memory into OOM territory on small VPSes.
    pub render_semaphore: Arc<tokio::sync::Semaphore>,
}

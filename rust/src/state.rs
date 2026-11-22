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
    /// Bounds concurrent PNG rasterizations (CPU fairness; memory is already
    /// bounded by strip rendering).
    pub render_semaphore: Arc<tokio::sync::Semaphore>,
    /// Rasterization density like sharp's: pixels = svg_units * density/72.
    /// 300 keeps pixel-identical output to the Next.js engine; 72 renders at
    /// the SVG's native size (= device resolution, ~17x cheaper) for RAM- or
    /// CPU-constrained hosts.
    pub render_density: f64,
}

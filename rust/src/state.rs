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
}

//! HTTP wiring: the router and the small /api handlers.
//! Kept in the library so integration tests can drive the full stack with
//! an injected clock and a chosen default timezone.

use axum::body::Body;
use axum::extract::State;
use axum::http::{header, HeaderMap};
use axum::response::Response;
use axum::routing::{get, post};
use axum::Router;
use std::sync::Arc;

use crate::goal::{self, VARY_RSC};
use crate::jsnum::js_to_string;
use crate::state::AppState;

fn json_response(body: String) -> Response {
    Response::builder()
        .header(header::CONTENT_TYPE, "application/json")
        .header(header::VARY, VARY_RSC)
        .body(Body::from(body))
        .unwrap()
}

async fn health(State(state): State<Arc<AppState>>) -> Response {
    json_response(format!(
        "{{\"status\":\"ok\",\"timestamp\":\"{}\",\"defaultTzOffset\":{}}}",
        crate::stats::iso_now(),
        js_to_string(state.default_tz_offset_ms / 3_600_000.0)
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

pub fn build_router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/goal", get(goal::goal_handler))
        .route("/api/health", get(health))
        .route("/api/visit", post(visit))
        .route("/api/stats", get(stats_endpoint))
        .fallback(static_fallback)
        .with_state(state)
}

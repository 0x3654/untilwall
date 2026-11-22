//! Static file serving for the exported Next.js UI.
//!
//! The reference image serves public/ assets and prerendered HTML through
//! Next's built-in static handler; here we serve the `output: export` tree
//! directly. Cache headers mirror the reference behaviour:
//!   - /_next/static/*  -> public, max-age=31536000, immutable
//!   - everything else  -> public, max-age=0 + weak ETag (sirv-style
//!     W/"<size-hex>-<mtime-ms-hex>") and Last-Modified.

use axum::body::Body;
use axum::http::{header, StatusCode};
use axum::response::Response;
use std::path::{Component, Path, PathBuf};

pub struct StaticService {
    root: PathBuf,
}

fn mime_for(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        // Next.js serves HTML with a lowercase charset, sirv-style assets
        // with uppercase (verified against the reference image).
        "html" | "htm" => "text/html; charset=utf-8",
        "css" => "text/css; charset=UTF-8",
        "js" | "mjs" => "application/javascript; charset=UTF-8",
        "json" | "map" => "application/json; charset=UTF-8",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "svg" => "image/svg+xml",
        "ico" => "image/x-icon",
        "txt" => "text/plain; charset=UTF-8",
        "woff2" => "font/woff2",
        "woff" => "font/woff",
        "ttf" => "font/ttf",
        "webmanifest" => "application/manifest+json",
        _ => "application/octet-stream",
    }
}

fn http_date(secs: i64) -> String {
    chrono::DateTime::from_timestamp(secs, 0)
        .map(|dt| dt.format("%a, %d %b %Y %H:%M:%S GMT").to_string())
        .unwrap_or_default()
}

impl StaticService {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        StaticService { root: root.into() }
    }

    /// Resolve a request path inside the root (traversal-safe).
    fn resolve(&self, url_path: &str) -> Option<PathBuf> {
        let decoded: String = percent_decode(url_path);
        let rel = decoded.trim_start_matches('/');
        let mut safe = PathBuf::new();
        for comp in Path::new(rel).components() {
            match comp {
                Component::Normal(c) => safe.push(c),
                Component::CurDir => {}
                _ => return None, // ParentDir, RootDir, prefix -> reject
            }
        }
        let full = self.root.join(safe);
        if full.starts_with(&self.root) {
            Some(full)
        } else {
            None
        }
    }

    pub async fn serve(&self, url_path: &str) -> Response {
        // serve /api/* style leftovers must never resolve into the tree
        if url_path.starts_with("/goal") || url_path.starts_with("/api/") {
            return self.not_found();
        }
        let Some(mut file_path) = self.resolve(url_path) else {
            return self.not_found();
        };

        let meta = std::fs::metadata(&file_path);
        if meta.as_ref().map(|m| m.is_dir()).unwrap_or(false) {
            file_path.push("index.html");
        }

        match std::fs::metadata(&file_path) {
            Ok(m) if m.is_file() => {
                let Ok(data) = std::fs::read(&file_path) else {
                    return self.not_found();
                };
                let mime = mime_for(&file_path);
                let immutable_cache = decoded_starts_with_static(url_path);
                let mut builder = Response::builder()
                    .header(header::CONTENT_TYPE, mime)
                    .header(
                        header::CACHE_CONTROL,
                        if immutable_cache {
                            "public, max-age=31536000, immutable"
                        } else {
                            "public, max-age=0"
                        },
                    )
                    .header(header::ACCEPT_RANGES, "bytes");
                if let Ok(mtime) = m.modified() {
                    if let Ok(dur) = mtime.duration_since(std::time::UNIX_EPOCH) {
                        let mtime_ms = dur.as_millis() as u128;
                        let secs = dur.as_secs() as i64;
                        builder = builder
                            .header(header::LAST_MODIFIED, http_date(secs))
                            .header(
                                header::ETAG,
                                format!("W/\"{:x}-{:x}\"", data.len(), mtime_ms),
                            );
                    }
                }
                builder.body(Body::from(data)).unwrap()
            }
            _ => self.not_found(),
        }
    }

    /// Next.js emits out/404.html for unknown routes; serve it with 404.
    fn not_found(&self) -> Response {
        let path = self.root.join("404.html");
        let body = std::fs::read(&path).unwrap_or_else(|_| {
            b"<!DOCTYPE html><html><head><title>404: This page could not be found.</title></head><body><h1>404</h1><p>This page could not be found.</p></body></html>".to_vec()
        });
        Response::builder()
            .status(StatusCode::NOT_FOUND)
            .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
            .header(header::CACHE_CONTROL, "private, no-cache, no-store, max-age=0, must-revalidate")
            .body(Body::from(body))
            .unwrap()
    }
}

fn decoded_starts_with_static(url_path: &str) -> bool {
    percent_decode(url_path).starts_with("/_next/static/")
}

/// Minimal percent-decoding for path segments ('+' stays a plus here).
fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let hex = |b: u8| -> Option<u8> {
        match b {
            b'0'..=b'9' => Some(b - b'0'),
            b'a'..=b'f' => Some(b - b'a' + 10),
            b'A'..=b'F' => Some(b - b'A' + 10),
            _ => None,
        }
    };
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(hi), Some(lo)) = (hex(bytes[i + 1]), hex(bytes[i + 2])) {
                out.push(hi * 16 + lo);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

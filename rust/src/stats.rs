//! Statistics tracking - drop-in compatible with src/lib/stats.ts.
//!
//! Same JSON shape, same key order (serde_json preserve_order), same file
//! format (2-space pretty print), so an existing data/stats.json keeps
//! working across the engine switch.

use chrono::Utc;
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

pub struct Stats {
    file_path: PathBuf,
    lock: Mutex<()>,
}

fn default_stats() -> Value {
    json!({
        "totalRequests": 0,
        "imageGenerations": 0,
        "uniqueVisitors": [],
        "devices": {},
        "daily": {},
        "lastUpdated": Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
    })
}

/// JS `new Date().toISOString()` - always UTC with milliseconds, e.g.
/// "2026-11-22T20:11:36.400Z".
pub fn iso_now() -> String {
    Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

fn today() -> String {
    Utc::now().format("%Y-%m-%d").to_string()
}

impl Stats {
    pub fn new(data_dir: &Path) -> Self {
        fs::create_dir_all(data_dir).ok();
        Stats {
            file_path: data_dir.join("stats.json"),
            lock: Mutex::new(()),
        }
    }

    fn load(&self) -> Value {
        let _guard = self.lock.lock().unwrap();
        self.load_locked()
    }

    fn load_locked(&self) -> Value {
        if let Ok(text) = fs::read_to_string(&self.file_path) {
            if let Ok(mut parsed) = serde_json::from_str::<Value>(&text) {
                if parsed.is_object() {
                    // `if (!parsed.daily) parsed.daily = {}` - plus defensive
                    // normalization so a corrupted field can never panic below.
                    if !parsed["daily"].is_object() {
                        parsed["daily"] = json!({});
                    }
                    if parsed.get("totalRequests").and_then(|v| v.as_i64()).is_none() {
                        parsed["totalRequests"] = json!(0);
                    }
                    if parsed.get("imageGenerations").and_then(|v| v.as_i64()).is_none() {
                        parsed["imageGenerations"] = json!(0);
                    }
                    if !parsed["uniqueVisitors"].is_array() {
                        parsed["uniqueVisitors"] = json!([]);
                    }
                    if !parsed["devices"].is_object() {
                        parsed["devices"] = json!({});
                    }
                    return parsed;
                }
            }
        }
        default_stats()
    }

    fn save_locked(&self, stats: &mut Value) {
        stats["lastUpdated"] = Value::String(iso_now());
        if let Ok(text) = serde_json::to_string_pretty(stats) {
            // JSON.stringify has no trailing newline; neither does the
            // reference engine's stats.json (verified against the image).
            if fs::write(&self.file_path, text).is_err() {
                eprintln!("Error saving stats");
            }
        }
    }

    /// Mirror of trackVisitor(): unique visitor list, totalRequests, daily.
    pub fn track_visitor(&self, visitor_id: &str) {
        let _guard = self.lock.lock().unwrap();
        let mut stats = self.load_locked();

        if let Some(visitors) = stats["uniqueVisitors"].as_array_mut() {
            if !visitors.iter().any(|v| v.as_str() == Some(visitor_id)) {
                visitors.push(Value::String(visitor_id.to_string()));
            }
        }

        let tr = stats.get("totalRequests").and_then(|v| v.as_i64()).unwrap_or(0);
        stats["totalRequests"] = json!(tr + 1);

        let t = today();
        if stats["daily"].get(&t).is_none() {
            stats["daily"][&t] = json!({"requests": 0, "generations": 0});
        }
        let requests = stats["daily"].get(&t).and_then(|d| d.get("requests")).and_then(|v| v.as_i64()).unwrap_or(0);
        stats["daily"][&t]["requests"] = json!(requests + 1);

        self.save_locked(&mut stats);
    }

    /// Mirror of trackImageGeneration(): counter, device breakdown, daily.
    pub fn track_image_generation(&self, user_agent: &str) {
        let _guard = self.lock.lock().unwrap();
        let mut stats = self.load_locked();

        let gens = stats.get("imageGenerations").and_then(|v| v.as_i64()).unwrap_or(0);
        stats["imageGenerations"] = json!(gens + 1);

        let device = detect_device(user_agent);
        let current = stats["devices"].get(&device).and_then(|v| v.as_i64()).unwrap_or(0);
        stats["devices"][&device] = json!(current + 1);

        let t = today();
        if stats["daily"].get(&t).is_none() {
            stats["daily"][&t] = json!({"requests": 0, "generations": 0});
        }
        let generations = stats["daily"].get(&t).and_then(|d| d.get("generations")).and_then(|v| v.as_i64()).unwrap_or(0);
        stats["daily"][&t]["generations"] = json!(generations + 1);

        self.save_locked(&mut stats);
    }

    /// GET /api/stats response body (uniqueVisitors collapsed to a count).
    pub fn public_stats(&self) -> Value {
        let stats = self.load();
        json!({
            "totalRequests": stats.get("totalRequests").and_then(|v| v.as_i64()).unwrap_or(0),
            "imageGenerations": stats.get("imageGenerations").and_then(|v| v.as_i64()).unwrap_or(0),
            "uniqueVisitors": stats.get("uniqueVisitors").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0),
            "devices": stats.get("devices").cloned().unwrap_or(json!({})),
            "daily": stats.get("daily").cloned().unwrap_or(json!({})),
            "lastUpdated": stats.get("lastUpdated").cloned().unwrap_or(Value::Null),
        })
    }
}

/// Device detection from trackImageGeneration() - same order, substring tests.
fn detect_device(user_agent: &str) -> String {
    if user_agent.contains("iPhone") {
        "iPhone".to_string()
    } else if user_agent.contains("iPad") {
        "iPad".to_string()
    } else if user_agent.contains("Macintosh")
        || user_agent.contains("Mac OS X")
        || user_agent.contains("macOS")
    {
        "Mac".to_string()
    } else if user_agent.contains("Android") {
        "Android".to_string()
    } else if user_agent.contains("Windows") {
        "Windows".to_string()
    } else {
        "other".to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn device_detection_order() {
        // iPhone UA contains "Macintosh"? No - but it does not; still, order matters.
        assert_eq!(detect_device("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"), "iPhone");
        assert_eq!(detect_device("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)"), "iPad");
        assert_eq!(detect_device("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"), "Mac");
        assert_eq!(detect_device("Mozilla/5.0 (Linux; Android 14)"), "Android");
        assert_eq!(detect_device("Mozilla/5.0 (Windows NT 10.0)"), "Windows");
        assert_eq!(detect_device("curl/8.0"), "other");
    }

    #[test]
    fn file_roundtrip_and_legacy_compat() {
        let dir = std::env::temp_dir().join(format!("untilwall-stats-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        // legacy file with an unknown extra field and existing counts
        let legacy = r#"{
  "totalRequests": 5,
  "imageGenerations": 7,
  "uniqueVisitors": [
    "a",
    "b"
  ],
  "devices": {
    "Mac": 2,
    "iPhone": 5
  },
  "daily": {
    "2026-11-01": {
      "requests": 5,
      "generations": 7
    }
  },
  "lastUpdated": "2026-11-01T00:00:00.000Z",
  "extraLegacyField": true
}"#;
        fs::write(dir.join("stats.json"), legacy).unwrap();

        let stats = Stats::new(&dir);
        stats.track_visitor("c");
        stats.track_image_generation("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)");

        let public = stats.public_stats();
        assert_eq!(public["totalRequests"], 6);
        assert_eq!(public["imageGenerations"], 8);
        assert_eq!(public["uniqueVisitors"], 3);
        assert_eq!(public["devices"]["iPhone"], 6);
        assert_eq!(public["devices"]["Mac"], 2);
        // legacy field survives on disk
        let on_disk = fs::read_to_string(dir.join("stats.json")).unwrap();
        assert!(on_disk.contains("\"extraLegacyField\": true"));
        assert!(on_disk.contains("\"daily\": {"));
        assert_eq!(public["daily"]["2026-11-01"]["requests"], 5);
        fs::remove_dir_all(&dir).ok();
    }
}

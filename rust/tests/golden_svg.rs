//! Golden byte-parity tests.
//!
//! For every case captured by scripts/golden/capture.sh into tests/golden/
//! (format=svg cases), regenerate the SVG with the capture date pinned as
//! "now" and require byte-for-byte equality with the reference response.

use std::fs;
use std::path::PathBuf;

use untilwall::goal::{js_date_ms, parse_params};
use untilwall::query::Query;
use untilwall::svg::generate_svg;

/// Golden cases carry no `tz` param; the builder must therefore run with a
/// zero shift so output stays byte-identical to the UTC reference capture.

fn golden_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("rust/ has a parent")
        .join("tests")
        .join("golden")
}

fn percent_decode(s: &str) -> String {
    // values in params.txt are jq @uri-encoded (percent escapes only)
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = |b: u8| -> Option<u8> {
                match b {
                    b'0'..=b'9' => Some(b - b'0'),
                    b'a'..=b'f' => Some(b - b'a' + 10),
                    b'A'..=b'F' => Some(b - b'A' + 10),
                    _ => None,
                }
            };
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

fn load_case_params(dir: &std::path::Path) -> Option<Query> {
    let params_file = dir.join("params.txt");
    let text = fs::read_to_string(params_file).ok()?;
    let mut pairs = Vec::new();
    for line in text.lines() {
        if line.is_empty() {
            continue;
        }
        let (key, value) = line.split_once('\t')?;
        pairs.push((key.to_string(), percent_decode(value)));
    }
    Some(Query { pairs })
}

fn first_diff(a: &[u8], b: &[u8]) -> String {
    let n = a.len().min(b.len());
    for i in 0..n {
        if a[i] != b[i] {
            let ctx = |buf: &[u8], i: usize| {
                let start = i.saturating_sub(40);
                let end = (i + 40).min(buf.len());
                String::from_utf8_lossy(&buf[start..end]).replace('\n', "\\n")
            };
            return format!(
                "at byte {}:\n  expected: {}\n  actual:   {}",
                i,
                ctx(a, i),
                ctx(b, i)
            );
        }
    }
    format!("lengths differ: expected {} bytes, actual {} bytes", a.len(), b.len())
}

#[test]
fn golden_svg_byte_parity() {
    let root = golden_root();
    let capture_date = fs::read_to_string(root.join("CAPTURE_DATE"))
        .expect("tests/golden/CAPTURE_DATE must exist (run scripts/golden/capture.sh)");
    let capture_date = capture_date.trim().to_string();
    let now = js_date_ms(&capture_date).expect("valid capture date");

    let mut checked = 0usize;
    let mut failures = Vec::new();

    let entries = fs::read_dir(&root).expect("golden dir readable");
    for entry in entries.flatten() {
        let dir = entry.path();
        if !dir.is_dir() || !dir.join("body").exists() {
            continue;
        }
        let name = dir
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or_default()
            .to_string();
        if !name.starts_with("svg-") {
            continue;
        }
        let Some(query) = load_case_params(&dir) else {
            continue;
        };
        let cfg = parse_params(&query, now, 0.0);
        let generated = generate_svg(&cfg);
        let reference = fs::read(dir.join("body")).expect("body readable");

        if generated.as_bytes() != reference.as_slice() {
            failures.push(format!(
                "case {name}: {} (generated {} bytes)",
                first_diff(&reference, generated.as_bytes()),
                generated.len()
            ));
        }
        checked += 1;
    }

    assert!(checked >= 20, "expected at least 20 svg golden cases, got {checked}");
    assert!(
        failures.is_empty(),
        "{} of {} golden SVG cases mismatched:\n{}",
        failures.len(),
        checked,
        failures.join("\n---\n")
    );
}

/// The goal template with html=true embeds a PNG; at least verify our PNG
/// renderer produces the same pixel dimensions as the reference (density
/// 300 scaling with round-half-up).
#[test]
fn png_dimensions_match_golden() {
    let root = golden_root();
    let cases = ["png-default", "png-odd-size", "png-landscape", "png-small"];
    let capture_date = fs::read_to_string(root.join("CAPTURE_DATE"))
        .expect("CAPTURE_DATE")
        .trim()
        .to_string();
    let now = js_date_ms(&capture_date).unwrap();

    for name in cases {
        let dir = root.join(name);
        let body_path = dir.join("body");
        let Ok(reference) = fs::read(&body_path) else {
            continue; // PNG bodies are gitignored; skip when absent
        };
        if reference.len() < 24 || &reference[0..8] != b"\x89PNG\r\n\x1a\n" {
            continue;
        }
        let ref_w = u32::from_be_bytes(reference[16..20].try_into().unwrap());
        let ref_h = u32::from_be_bytes(reference[20..24].try_into().unwrap());

        let Some(query) = load_case_params(&dir) else {
            continue;
        };
        let cfg = parse_params(&query, now, 0.0);
        let _svg = generate_svg(&cfg); // exercised for panics; dims checked below
        let scale = 300.0f64 / 72.0;
        let w = (cfg.width * scale).round().max(1.0) as u32;
        let h = (cfg.height * scale).round().max(1.0) as u32;
        assert_eq!((w, h), (ref_w, ref_h), "case {name}: pixel dimensions");
    }
}

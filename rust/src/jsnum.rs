//! JavaScript numeric semantics required for byte-identical SVG output.
//!
//! The original implementation is a Next.js route handler that interpolates
//! JS numbers straight into an SVG template literal. To reproduce its output
//! byte-for-byte we must replicate:
//!   - `parseInt()` / `parseFloat()` prefix parsing quirks
//!   - `Math.round()` (floor(x + 0.5), ties toward +Infinity)
//!   - `Number.prototype.toString()` (shortest round-trip, exponential for
//!     |x| >= 1e21 and 0 < |x| < 1e-6, "-0" prints as "0")
//!   - `Number.prototype.toFixed(1)` (ties pick the larger n)

/// JS `String::trim()` leading-whitespace set (ASCII + common Unicode spaces).
fn trim_js_ws(s: &str) -> &str {
    s.trim_start_matches(|c: char| matches!(c,
        '\t' | '\n' | '\x0b' | '\x0c' | '\r' | ' ' |
        '\u{00a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}' |
        '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}'))
}

/// JS `parseInt(string)` with implicit radix (10, or 16 for a 0x prefix).
/// Parses the longest valid numeric prefix; returns None for NaN.
pub fn js_parse_int(s: &str) -> Option<f64> {
    let s = trim_js_ws(s);
    let (sign, rest) = match s.as_bytes().first() {
        Some(b'-') => (-1.0, &s[1..]),
        Some(b'+') => (1.0, &s[1..]),
        _ => (1.0, s),
    };
    let (radix, digits) = if let Some(hex) = rest.strip_prefix("0x").or_else(|| rest.strip_prefix("0X")) {
        (16u32, hex)
    } else {
        (10u32, rest)
    };
    let valid: String = digits
        .chars()
        .take_while(|c| c.is_digit(radix))
        .collect();
    if valid.is_empty() {
        return None;
    }
    let mut value = 0f64;
    for c in valid.chars() {
        value = value * radix as f64 + c.to_digit(radix).unwrap() as f64;
    }
    // parseInt caps at double precision; values beyond 2^53 lose precision
    // exactly like JS does (repeated multiply-add in f64 reproduces that).
    Some(sign * value)
}

/// JS `parseFloat(string)`: longest decimal prefix, accepts Infinity.
/// "0x10" parses as 0 (stops at 'x'). Returns None for NaN.
pub fn js_parse_float(s: &str) -> Option<f64> {
    let s = trim_js_ws(s);
    let bytes = s.as_bytes();
    let mut i = 0usize;
    let negative = i < bytes.len() && bytes[i] == b'-';
    if i < bytes.len() && (bytes[i] == b'-' || bytes[i] == b'+') {
        i += 1;
    }
    if s[i..].starts_with("Infinity") {
        return Some(if negative { f64::NEG_INFINITY } else { f64::INFINITY });
    }
    let start_digits = i;
    while i < bytes.len() && bytes[i].is_ascii_digit() { i += 1; }
    let int_len = i - start_digits;
    let mut frac_len = 0usize;
    if i < bytes.len() && bytes[i] == b'.' {
        let dot = i;
        i += 1;
        let fstart = i;
        while i < bytes.len() && bytes[i].is_ascii_digit() { i += 1; }
        frac_len = i - fstart;
        if int_len == 0 && frac_len == 0 {
            // "." or "+." -> NaN; rewind so exp parsing does not run
            i = dot;
            frac_len = 0;
        }
    }
    if int_len == 0 && frac_len == 0 {
        return None;
    }
    let mantissa_end = i;
    // optional exponent: only if at least one exponent digit follows
    let mut end = mantissa_end;
    if i < bytes.len() && (bytes[i] == b'e' || bytes[i] == b'E') {
        let mut j = i + 1;
        if j < bytes.len() && (bytes[j] == b'+' || bytes[j] == b'-') { j += 1; }
        let dstart = j;
        while j < bytes.len() && bytes[j].is_ascii_digit() { j += 1; }
        if j > dstart {
            end = j;
        }
    }
    let parsed: f64 = s[..end].parse().ok()?;
    Some(parsed)
}

/// JS `Math.round(x)` = floor(x + 0.5) (ties resolve toward +Infinity).
pub fn js_round(x: f64) -> f64 {
    (x + 0.5).floor()
}

/// JS `Number(x).toString()` for template-literal interpolation.
pub fn js_to_string(x: f64) -> String {
    if x.is_nan() {
        return "NaN".to_string();
    }
    if x == 0.0 {
        return "0".to_string(); // covers -0: JS prints "0"
    }
    if x.is_infinite() {
        return if x > 0.0 { "Infinity" } else { "-Infinity" }.to_string();
    }
    let a = x.abs();
    if a >= 1e21 || a < 1e-6 {
        // JS switches to exponential form; Rust's {:e} is shortest too but
        // formats the exponent without an explicit '+'.
        let s = format!("{:e}", x);
        if let Some(pos) = s.find('e') {
            let (mantissa, exp) = s.split_at(pos);
            let e: i64 = exp[1..].parse().unwrap_or(0);
            if e >= 0 {
                format!("{mantissa}e+{e}")
            } else {
                format!("{mantissa}e-{}", -e)
            }
        } else {
            s
        }
    } else {
        // Shortest round-trip positional notation: identical to JS in this range.
        format!("{x}")
    }
}

/// JS `x.toFixed(1)`: n = integer closest to the EXACT value of x*10, ties
/// pick the larger n (i.e. floor(exact(x*10) + 0.5) in exact arithmetic).
///
/// Computing x*10 in f64 first would double-round (88.84999999999999 * 10
/// rounds up to exactly 888.5), so we decompose the f64 bits and do the
/// round-half-up on the exact rational m * 2^e * 10.
pub fn js_to_fixed_1(x: f64) -> String {
    if x.is_nan() {
        return "NaN".to_string();
    }
    if !x.is_finite() {
        // JS toFixed() throws RangeError for |x| >= 1e21; Infinity yields
        // "Infinity" in practice via string coercion paths we mirror loosely.
        return js_to_string(x);
    }
    let n = exact_round_half_up_times_10(x);
    let neg = n < 0.0;
    let n_abs = if neg { -n } else { n };
    let int_part = (n_abs / 10.0).floor();
    let frac = n_abs - int_part * 10.0;
    // frac is an exact small integer here; guard the formatting anyway
    let frac_char = char::from(b'0' + frac as u8);
    format!(
        "{}{}{}{}",
        if neg { "-" } else { "" },
        js_to_string(int_part),
        '.',
        frac_char
    )
}

/// floor(v * 10 + 1/2) computed on the exact value of v, for |v| < 1e21.
fn exact_round_half_up_times_10(x: f64) -> f64 {
    if x.abs() >= 1e21 {
        return (x * 10.0 + 0.5).floor(); // out of toFixed range; approximation
    }
    let bits = x.to_bits();
    let neg = bits >> 63 == 1;
    let biased = ((bits >> 52) & 0x7ff) as i32;
    let frac = bits & ((1u64 << 52) - 1);
    let (m, e) = if biased == 0 {
        if frac == 0 {
            return 0.0; // +-0
        }
        (frac as u128, -1074i32) // subnormal: v = frac * 2^-1074
    } else {
        ((frac | (1u64 << 52)) as u128, biased - 1075)
    };
    // v = m * 2^e exactly; scaled = m * 10 * 2^e
    let scaled = m * 10u128;
    let n: u128 = if e >= 0 {
        scaled << e.min(64) as u32 // x < 1e21 keeps this far below u128 overflow
    } else {
        let k = (-(e)) as u32;
        if k > 100 {
            0 // |x| < 1e-13: x*10 rounds to 0
        } else if neg {
            // ties pick the larger n: for negative x that rounds |x| DOWN
            (scaled + (1u128 << (k - 1)) - 1) >> k
        } else {
            (scaled + (1u128 << (k - 1))) >> k
        }
    };
    let nf = n as f64;
    if neg {
        -nf
    } else {
        nf
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_int_prefixes() {
        assert_eq!(js_parse_int("1290"), Some(1290.0));
        assert_eq!(js_parse_int("  12px"), Some(12.0));
        assert_eq!(js_parse_int("-5.9"), Some(-5.0));
        assert_eq!(js_parse_int("0x10"), Some(16.0));
        assert_eq!(js_parse_int("+42"), Some(42.0));
        assert_eq!(js_parse_int("abc"), None);
        assert_eq!(js_parse_int(""), None);
        assert_eq!(js_parse_int("1e3"), Some(1.0)); // stops at 'e'
    }

    #[test]
    fn parse_float_prefixes() {
        assert_eq!(js_parse_float("1.5"), Some(1.5));
        assert_eq!(js_parse_float(".5"), Some(0.5));
        assert_eq!(js_parse_float("5."), Some(5.0));
        assert_eq!(js_parse_float("1e3"), Some(1000.0));
        assert_eq!(js_parse_float("1e"), Some(1.0));
        assert_eq!(js_parse_float("0x10"), Some(0.0));
        assert_eq!(js_parse_float("-2.25abc"), Some(-2.25));
        assert_eq!(js_parse_float("Infinity"), Some(f64::INFINITY));
        assert_eq!(js_parse_float("abc"), None);
    }

    #[test]
    fn rounding() {
        assert_eq!(js_round(2.5), 3.0);
        assert_eq!(js_round(-2.5), -2.0); // ties toward +Infinity, not away
        assert_eq!(js_round(0.4), 0.0);
        assert_eq!(js_round(-0.5), js_round(-0.4));
        assert!(js_round(f64::NAN).is_nan());
    }

    #[test]
    fn to_string_forms() {
        assert_eq!(js_to_string(1290.0), "1290");
        assert_eq!(js_to_string(-0.0), "0");
        assert_eq!(js_to_string(0.1 + 0.2), "0.30000000000000004");
        assert_eq!(js_to_string(f64::NAN), "NaN");
        assert_eq!(js_to_string(1e21), "1e+21");
        assert_eq!(js_to_string(1.5e-7), "1.5e-7");
        assert_eq!(js_to_string(1e-6), "0.000001");
        assert_eq!(js_to_string(56.666666666666664), "56.666666666666664");
    }

    #[test]
    fn fixed_1() {
        assert_eq!(js_to_fixed_1(33.25), "33.3"); // tie -> larger n
        assert_eq!(js_to_fixed_1(-33.25), "-33.2");
        assert_eq!(js_to_fixed_1(88.84999999999999), "88.8");
        assert_eq!(js_to_fixed_1(0.0), "0.0");
        assert_eq!(js_to_fixed_1(100.0), "100.0");
        assert_eq!(js_to_fixed_1(f64::NAN), "NaN");
    }
}

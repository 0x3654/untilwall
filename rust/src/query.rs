//! Query-string handling mirroring the JS `URLSearchParams` semantics the
//! original route handler relies on: `get()` returns the FIRST occurrence of
//! a key, while the SVG cache key is built with `set()` which keeps the
//! first-occurrence position but lets the LAST value win and drops duplicates.

#[derive(Debug, Clone)]
pub struct Query {
    /// (key, value) pairs in the order they appear in the query string.
    pub pairs: Vec<(String, String)>,
}

impl Query {
    /// Parse a raw query string (without the leading '?').
    /// `form_urlencoded` decodes '+' as space and percent-escapes the same way
    /// URLSearchParams does.
    pub fn parse(raw: Option<&str>) -> Self {
        let pairs = raw
            .map(|r| {
                form_urlencoded::parse(r.as_bytes())
                    .map(|(k, v)| (k.into_owned(), v.into_owned()))
                    .collect()
            })
            .unwrap_or_default();
        Query { pairs }
    }

    /// JS `searchParams.get(key)`: value of the first occurrence, else None.
    pub fn get(&self, key: &str) -> Option<&str> {
        self.pairs
            .iter()
            .find(|(k, _)| k == key)
            .map(|(_, v)| v.as_str())
    }
}

/// Reproduce the route's cache-key construction:
/// ```js
/// const cacheKey = new URLSearchParams();
/// for (const [key, value] of searchParams.entries()) {
///   if (key !== 'format' && key !== 'html' && key !== 't') cacheKey.set(key, value);
/// }
/// // svgCache.generateKey: keyParts.push(`${key}=${value}`).join('&')
/// ```
/// `set()` replaces the value of the first pair with that name and removes the
/// rest, so the result is: unique keys in first-occurrence order, each mapped
/// to its last-seen value.
pub fn cache_key(q: &Query) -> String {
    let mut order: Vec<String> = Vec::new();
    let mut map: std::collections::HashMap<&str, &str> = std::collections::HashMap::new();
    for (k, v) in &q.pairs {
        if k == "format" || k == "html" || k == "t" {
            continue;
        }
        if !map.contains_key(k.as_str()) {
            order.push(k.clone());
        }
        map.insert(k.as_str(), v.as_str());
    }
    order
        .iter()
        .map(|k| format!("{}={}", k, map[k.as_str()]))
        .collect::<Vec<_>>()
        .join("&")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn first_occurrence_wins_for_get() {
        let q = Query::parse(Some("width=100&width=200"));
        assert_eq!(q.get("width"), Some("100"));
    }

    #[test]
    fn last_occurrence_wins_for_cache_key() {
        let q = Query::parse(Some("a=1&b=2&a=3&format=svg&t=9&html=true"));
        assert_eq!(cache_key(&q), "a=3&b=2");
    }

    #[test]
    fn plus_and_percent_decoding() {
        let q = Query::parse(Some("goal_text=one+two%0Atwo&x=%23ff6b35"));
        assert_eq!(q.get("goal_text"), Some("one two\ntwo"));
        assert_eq!(q.get("x"), Some("#ff6b35"));
    }
}

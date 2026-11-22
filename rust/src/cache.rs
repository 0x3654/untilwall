//! In-memory SVG cache with the same behaviour as src/lib/cache.ts:
//! capacity 200 entries, 60-minute TTL, eviction of the entry with the
//! oldest write timestamp (not a true LRU - reads do not refresh entries).

use std::collections::HashMap;
use std::time::{Duration, Instant};

pub struct SvgCache {
    map: HashMap<String, (String, Instant)>,
    max_size: usize,
    ttl: Duration,
}

impl SvgCache {
    pub fn new(max_size: usize, ttl_minutes: u64) -> Self {
        SvgCache {
            map: HashMap::new(),
            max_size,
            ttl: Duration::from_secs(ttl_minutes * 60),
        }
    }

    pub fn get(&mut self, key: &str) -> Option<String> {
        let expired = match self.map.get(key) {
            Some((_, ts)) => Instant::now().duration_since(*ts) > self.ttl,
            None => return None,
        };
        if expired {
            self.map.remove(key);
            return None;
        }
        self.map.get(key).map(|(data, _)| data.clone())
    }

    pub fn set(&mut self, key: String, data: String) {
        if self.map.len() >= self.max_size {
            // Delete the oldest entry (smallest timestamp).
            let mut oldest_key: Option<String> = None;
            let mut oldest_time = Instant::now();
            for (k, (_, ts)) in &self.map {
                if *ts < oldest_time {
                    oldest_time = *ts;
                    oldest_key = Some(k.clone());
                }
            }
            if let Some(k) = oldest_key {
                self.map.remove(&k);
            }
        }
        self.map.insert(key, (data, Instant::now()));
    }

    pub fn len(&self) -> usize {
        self.map.len()
    }

    pub fn is_empty(&self) -> bool {
        self.map.is_empty()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn set_get_roundtrip() {
        let mut c = SvgCache::new(2, 60);
        c.set("a".into(), "svg-a".into());
        assert_eq!(c.get("a").as_deref(), Some("svg-a"));
        assert!(c.get("missing").is_none());
    }

    #[test]
    fn evicts_oldest_when_full() {
        let mut c = SvgCache::new(2, 60);
        c.set("a".into(), "1".into());
        std::thread::sleep(Duration::from_millis(5));
        c.set("b".into(), "2".into());
        std::thread::sleep(Duration::from_millis(5));
        c.set("c".into(), "3".into()); // evicts "a" (oldest)
        assert!(c.get("a").is_none());
        assert_eq!(c.get("b").as_deref(), Some("2"));
        assert_eq!(c.get("c").as_deref(), Some("3"));
        assert_eq!(c.len(), 2);
    }
}

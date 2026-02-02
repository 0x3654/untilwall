// Simple in-memory cache for generated SVGs
interface CacheEntry {
  data: string;
  timestamp: number;
}

class SVGCache {
  private cache: Map<string, CacheEntry> = new Map();
  private maxSize: number;
  private ttl: number; // Time to live in milliseconds

  constructor(maxSize = 100, ttlMinutes = 30) {
    this.maxSize = maxSize;
    this.ttl = ttlMinutes * 60 * 1000;
  }

  private generateKey(params: URLSearchParams): string {
    // Create a consistent key from all parameters except 't' (timestamp)
    const keyParts: string[] = [];
    for (const [key, value] of params.entries()) {
      if (key !== 't') { // Skip cache-busting timestamp
        keyParts.push(`${key}=${value}`);
      }
    }
    return keyParts.join('&');
  }

  get(params: URLSearchParams): string | null {
    const key = this.generateKey(params);
    const entry = this.cache.get(key);

    if (!entry) return null;

    // Check if entry is expired
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  set(params: URLSearchParams, data: string): void {
    const key = this.generateKey(params);

    // Implement LRU eviction if cache is full
    if (this.cache.size >= this.maxSize) {
      // Delete oldest entry
      let oldestKey: string | null = null;
      let oldestTime = Infinity;

      for (const [k, v] of this.cache.entries()) {
        if (v.timestamp < oldestTime) {
          oldestTime = v.timestamp;
          oldestKey = k;
        }
      }

      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

// Export singleton instance
export const svgCache = new SVGCache(200, 60); // Cache 200 items for 60 minutes

export interface CacheEntry<V> {
  value: V;
  expiresAt: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  maxSize: number;
}

export class LruCache<K = string, V = unknown> {
  private readonly maxSize: number;
  private readonly defaultTtlMs: number;
  private cache: Map<K, CacheEntry<V>> = new Map();
  private hits = 0;
  private misses = 0;

  constructor(maxSize = 10000, defaultTtlMs = 300000) {
    this.maxSize = maxSize;
    this.defaultTtlMs = defaultTtlMs;
  }

  public get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      return undefined;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      return undefined;
    }

    // Refresh LRU order (delete and re-insert makes it most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    this.hits++;
    return entry.value;
  }

  public set(key: K, value: V, ttlMs?: number): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Evict least recently used (first key in map)
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }

    const ttl = ttlMs !== undefined ? ttlMs : this.defaultTtlMs;
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttl,
    });
  }

  public has(key: K): boolean {
    const value = this.get(key);
    return value !== undefined;
  }

  public delete(key: K): boolean {
    return this.cache.delete(key);
  }

  public clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  public size(): number {
    return this.cache.size;
  }

  public getStats(): CacheStats {
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
      maxSize: this.maxSize,
    };
  }
}

// Global cached providers
export const catalogMetadataCache = new LruCache<string, Record<string, unknown>>(50000, 3600000); // 1 hr TTL
export const fallbackItemsCache = new LruCache<string, unknown[]>(100, 86400000); // 24 hr TTL

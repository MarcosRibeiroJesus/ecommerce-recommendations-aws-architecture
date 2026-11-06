import { RecommendedItem } from '../../domain/candidate';
import { fallbackItemsCache } from '../cache/lru-cache.provider';

export const STATIC_CURATED_CATALOG: Omit<RecommendedItem, 'rank' | 'score' | 'provenance'>[] = [
  { itemId: 'SKU-FALLBACK-01', title: 'Amazon Echo Dot (5th Gen) Smart Speaker', priceCents: 4999, category: 'Electronics' },
  { itemId: 'SKU-FALLBACK-02', title: 'Kindle Paperwhite 16 GB', priceCents: 14999, category: 'Electronics' },
  { itemId: 'SKU-FALLBACK-03', title: 'Fire TV Stick 4K Streaming Device', priceCents: 3999, category: 'Electronics' },
  { itemId: 'SKU-FALLBACK-04', title: 'Apple AirPods Pro (2nd Generation)', priceCents: 24999, category: 'Electronics' },
  { itemId: 'SKU-FALLBACK-05', title: 'Stanley Quencher H2.0 FlowState Tumbler', priceCents: 3500, category: 'Home & Kitchen' },
  { itemId: 'SKU-FALLBACK-06', title: 'Instant Pot Duo 7-in-1 Electric Pressure Cooker', priceCents: 7999, category: 'Home & Kitchen' },
  { itemId: 'SKU-FALLBACK-07', title: 'Anker Portable Charger 20,000mAh Power Bank', priceCents: 3999, category: 'Accessories' },
  { itemId: 'SKU-FALLBACK-08', title: 'Sony WH-1000XM5 Wireless Noise Canceling Headphones', priceCents: 39999, category: 'Electronics' },
  { itemId: 'SKU-FALLBACK-09', title: 'Logitech MX Master 3S Wireless Mouse', priceCents: 9999, category: 'Computers' },
  { itemId: 'SKU-FALLBACK-10', title: 'Bose QuietComfort 45 Bluetooth Wireless Headphones', priceCents: 32900, category: 'Electronics' },
];

export interface ICuratedFallbackProvider {
  getFallbackRecommendations(limit?: number): RecommendedItem[];
}

export class CuratedFallbackProvider implements ICuratedFallbackProvider {
  public getFallbackRecommendations(limit = 10): RecommendedItem[] {
    const cacheKey = `fallback-top-${limit}`;
    const cached = fallbackItemsCache.get(cacheKey) as RecommendedItem[] | undefined;
    if (cached) {
      return cached;
    }

    const items = STATIC_CURATED_CATALOG.slice(0, limit).map((product, index) => ({
      ...product,
      rank: index + 1,
      score: Math.max(0.1, 0.5 - index * 0.02),
      provenance: 'fallback' as const,
    }));

    fallbackItemsCache.set(cacheKey, items);
    return items;
  }
}

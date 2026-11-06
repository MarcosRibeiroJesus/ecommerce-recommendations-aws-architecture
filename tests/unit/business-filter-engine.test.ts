import { describe, it, expect } from 'vitest';
import {
  BusinessFilterEngine,
  FilterContext,
} from '../../src/serving/src/application/business-filter-engine';
import {
  OutOfStockFilterRule,
  RecentPurchaseSuppressionRule,
  CategorySuppressionRule,
  GeoRestrictionRule,
} from '../../src/serving/src/domain/filter-rule';
import { MergedCandidate } from '../../src/serving/src/domain/candidate';

describe('BusinessFilterEngine (Unit)', () => {
  const sampleCandidates: MergedCandidate[] = [
    { itemId: 'PROD-1', provenance: 'hybrid', initialCombinedScore: 0.95, inStock: true, category: 'Electronics' },
    { itemId: 'PROD-2', provenance: 'batch', initialCombinedScore: 0.90, inStock: false, category: 'Electronics' }, // Out of stock
    { itemId: 'PROD-3', provenance: 'realtime', initialCombinedScore: 0.85, inStock: true, category: 'Books' },     // Recently purchased
    { itemId: 'PROD-4', provenance: 'batch', initialCombinedScore: 0.80, inStock: true, category: 'Weapons' },     // Restricted category
    { itemId: 'PROD-5', provenance: 'realtime', initialCombinedScore: 0.75, inStock: true, category: 'Apparel' },   // Geo restricted
  ];

  it('should unconditionally filter out out-of-stock items', () => {
    const engine = new BusinessFilterEngine([new OutOfStockFilterRule()]);
    const context: FilterContext = { userId: 'u-12345' };

    const result = engine.filter(sampleCandidates, context);

    expect(result.candidates.map((c) => c.itemId)).not.toContain('PROD-2');
    expect(result.filteredOutCount).toBe(1);
  });

  it('should suppress products purchased by user within the 30-day window', () => {
    const engine = new BusinessFilterEngine([new RecentPurchaseSuppressionRule()]);
    const context: FilterContext = {
      userId: 'u-12345',
      recentPurchases: [{ itemId: 'PROD-3', purchaseTimestamp: Date.now() - 5 * 86400000 }], // 5 days ago
    };

    const result = engine.filter(sampleCandidates, context);

    expect(result.candidates.map((c) => c.itemId)).not.toContain('PROD-3');
    expect(result.filteredOutCount).toBe(1);
  });

  it('should NOT suppress products purchased more than 30 days ago', () => {
    const engine = new BusinessFilterEngine([new RecentPurchaseSuppressionRule()]);
    const context: FilterContext = {
      userId: 'u-12345',
      recentPurchases: [{ itemId: 'PROD-3', purchaseTimestamp: Date.now() - 35 * 86400000 }], // 35 days ago (> 30d)
    };

    const result = engine.filter(sampleCandidates, context);

    expect(result.candidates.map((c) => c.itemId)).toContain('PROD-3');
    expect(result.filteredOutCount).toBe(0);
  });

  it('should filter out restricted categories', () => {
    const engine = new BusinessFilterEngine([new CategorySuppressionRule(['Weapons', 'Tobacco'])]);
    const context: FilterContext = { userId: 'u-12345' };

    const result = engine.filter(sampleCandidates, context);

    expect(result.candidates.map((c) => c.itemId)).not.toContain('PROD-4');
    expect(result.filteredOutCount).toBe(1);
  });

  it('should filter out geo-restricted items when user country does not match', () => {
    const engine = new BusinessFilterEngine([
      new GeoRestrictionRule(new Map([['PROD-5', ['US', 'CA']]])),
    ]);
    const context: FilterContext = { userId: 'u-12345', userCountry: 'BR' }; // Brazilian user cannot buy PROD-5

    const result = engine.filter(sampleCandidates, context);

    expect(result.candidates.map((c) => c.itemId)).not.toContain('PROD-5');
    expect(result.filteredOutCount).toBe(1);
  });

  it('should apply all rules in sequence and report before/after metrics accurately', () => {
    const engine = new BusinessFilterEngine([
      new OutOfStockFilterRule(),
      new RecentPurchaseSuppressionRule(),
      new CategorySuppressionRule(['Weapons']),
      new GeoRestrictionRule(new Map([['PROD-5', ['US']]])),
    ]);

    const context: FilterContext = {
      userId: 'u-12345',
      recentPurchases: [{ itemId: 'PROD-3', purchaseTimestamp: Date.now() - 86400000 }],
      userCountry: 'UK',
    };

    const result = engine.filter(sampleCandidates, context);

    // Only PROD-1 survives
    expect(result.candidates.map((c) => c.itemId)).toEqual(['PROD-1']);
    expect(result.totalBefore).toBe(5);
    expect(result.totalAfter).toBe(1);
    expect(result.filteredOutCount).toBe(4);
  });
});

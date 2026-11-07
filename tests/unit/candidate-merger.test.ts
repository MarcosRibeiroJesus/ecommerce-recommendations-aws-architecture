import { describe, it, expect } from 'vitest';
import { mergeCandidates } from '../../src/serving/src/application/candidate-merger';
import { BatchCandidate, SemanticCandidate } from '../../src/serving/src/domain/candidate';

describe('CandidateMerger (Unit)', () => {
  it('should tag item appearing only in batch as "batch" provenance', () => {
    const batchCandidates: BatchCandidate[] = [
      { itemId: 'item-1', score: 0.85, rank: 1, title: 'Item 1', priceCents: 1000 },
    ];
    const semanticCandidates: SemanticCandidate[] = [];

    const merged = mergeCandidates(batchCandidates, semanticCandidates);

    expect(merged).toHaveLength(1);
    expect(merged[0].itemId).toBe('item-1');
    expect(merged[0].provenance).toBe('batch');
    expect(merged[0].batchScore).toBe(0.85);
    expect(merged[0].vectorScore).toBeUndefined();
    expect(merged[0].initialCombinedScore).toBeCloseTo(0.85);
  });

  it('should tag item appearing only in realtime as "realtime" provenance', () => {
    const batchCandidates: BatchCandidate[] = [];
    const semanticCandidates: SemanticCandidate[] = [
      { itemId: 'item-2', vectorScore: 0.92, title: 'Item 2', priceCents: 2000 },
    ];

    const merged = mergeCandidates(batchCandidates, semanticCandidates);

    expect(merged).toHaveLength(1);
    expect(merged[0].itemId).toBe('item-2');
    expect(merged[0].provenance).toBe('realtime');
    expect(merged[0].vectorScore).toBe(0.92);
    expect(merged[0].batchScore).toBeUndefined();
    expect(merged[0].initialCombinedScore).toBeCloseTo(0.92);
  });

  it('should deduplicate items and tag items appearing in both sources as "hybrid"', () => {
    const batchCandidates: BatchCandidate[] = [
      { itemId: 'item-shared', score: 0.8, rank: 1, title: 'Shared Item', priceCents: 1500, category: 'Electronics' },
      { itemId: 'item-batch-only', score: 0.7, rank: 2, title: 'Batch Only', priceCents: 1200 },
    ];
    const semanticCandidates: SemanticCandidate[] = [
      { itemId: 'item-shared', vectorScore: 0.9, title: 'Shared Item', priceCents: 1500, category: 'Electronics' },
      { itemId: 'item-vector-only', vectorScore: 0.6, title: 'Vector Only', priceCents: 800 },
    ];

    const merged = mergeCandidates(batchCandidates, semanticCandidates);

    expect(merged).toHaveLength(3);

    const shared = merged.find((c) => c.itemId === 'item-shared');
    expect(shared).toBeDefined();
    expect(shared?.provenance).toBe('hybrid');
    expect(shared?.batchScore).toBe(0.8);
    expect(shared?.vectorScore).toBe(0.9);
    // (0.5 * 0.8) + (0.5 * 0.9) = 0.85
    expect(shared?.initialCombinedScore).toBeCloseTo(0.85);
    expect(shared?.category).toBe('Electronics');

    const batchOnly = merged.find((c) => c.itemId === 'item-batch-only');
    expect(batchOnly?.provenance).toBe('batch');

    const vectorOnly = merged.find((c) => c.itemId === 'item-vector-only');
    expect(vectorOnly?.provenance).toBe('realtime');
  });

  it('should handle empty candidates from both sources gracefully', () => {
    const merged = mergeCandidates([], []);
    expect(merged).toEqual([]);
  });
});

import { describe, it, expect } from 'vitest';
import { deriveSessionQueryVector, EMBEDDING_DIMENSION } from '../../src/serving/src/application/session-embedding';

function computeNorm(vec: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) {
    sum += vec[i] * vec[i];
  }
  return Math.sqrt(sum);
}

describe('Session Embedding Deterministic Derivation (Unit)', () => {
  it('should generate a 128-dimensional L2-normalized Float32Array (512 bytes) from sessionItemIds', () => {
    const vec = deriveSessionQueryVector(['SKU-1001', 'SKU-2002'], 'u-12345');
    expect(vec).toBeInstanceOf(Float32Array);
    expect(vec.length).toBe(EMBEDDING_DIMENSION);
    expect(vec.byteLength).toBe(512);
    expect(computeNorm(vec)).toBeCloseTo(1.0, 5);
  });

  it('should be strictly deterministic for identical sessionItemIds', () => {
    const v1 = deriveSessionQueryVector(['SKU-1001', 'SKU-2002'], 'u-12345');
    const v2 = deriveSessionQueryVector(['SKU-1001', 'SKU-2002'], 'u-12345');
    expect(Array.from(v1)).toEqual(Array.from(v2));
  });

  it('should produce distinct vectors for different sessionItemIds and respect recency order', () => {
    const vA = deriveSessionQueryVector(['SKU-1001', 'SKU-2002'], 'u-12345');
    const vB = deriveSessionQueryVector(['SKU-9999'], 'u-12345');
    const vReversed = deriveSessionQueryVector(['SKU-2002', 'SKU-1001'], 'u-12345');

    expect(Array.from(vA)).not.toEqual(Array.from(vB));
    expect(Array.from(vA)).not.toEqual(Array.from(vReversed));
  });

  it('should fall back deterministically to userId seed when sessionItemIds is empty or undefined, never returning all zeros', () => {
    const vEmpty = deriveSessionQueryVector([], 'u-55555');
    const vUndefined = deriveSessionQueryVector(undefined, 'u-55555');
    const vOtherUser = deriveSessionQueryVector([], 'u-77777');

    expect(computeNorm(vEmpty)).toBeCloseTo(1.0, 5);
    expect(Array.from(vEmpty)).toEqual(Array.from(vUndefined));
    expect(Array.from(vEmpty)).not.toEqual(Array.from(vOtherUser));
  });
});

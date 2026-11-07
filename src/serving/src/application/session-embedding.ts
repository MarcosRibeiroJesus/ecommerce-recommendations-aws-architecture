import { createHash } from 'crypto';

export const EMBEDDING_DIMENSION = 128;

/**
 * Generates a deterministic 128-dimensional raw float vector in [-1, 1] from a string seed
 * using chained SHA-256 digests (16 digests * 8 float32 values = 128 dimensions).
 */
function seedToVector(seed: string): Float32Array {
  const vector = new Float32Array(EMBEDDING_DIMENSION);
  let offset = 0;
  let counter = 0;

  while (offset < EMBEDDING_DIMENSION) {
    const digest = createHash('sha256')
      .update(`${seed}:${counter}`)
      .digest();

    for (let i = 0; i < digest.length && offset < EMBEDDING_DIMENSION; i += 2) {
      const uint16 = digest.readUInt16BE(i);
      // Map [0, 65535] -> [-1.0, 1.0]
      vector[offset] = (uint16 / 32767.5) - 1.0;
      offset += 1;
    }
    counter += 1;
  }

  return vector;
}

/**
 * L2-normalizes a Float32Array in place so ||v||_2 = 1.0.
 * Guarantees valid, non-NaN cosine similarity in MemoryDB HNSW search.
 */
export function l2Normalize(vector: Float32Array): Float32Array {
  let sumSquares = 0;
  for (let i = 0; i < vector.length; i++) {
    sumSquares += vector[i] * vector[i];
  }

  const norm = Math.sqrt(sumSquares);
  if (norm > 1e-12) {
    for (let i = 0; i < vector.length; i++) {
      vector[i] = vector[i] / norm;
    }
  } else {
    // Fallback unit vector along first dimension if degenerate
    vector[0] = 1.0;
  }

  return vector;
}

/**
 * Derives a deterministic, L2-normalized 128-dimensional query vector from in-session item IDs.
 * - Uses recency weighting (1 / (index + 1)) across sessionItemIds.
 * - Falls back deterministically to userId seed when sessionItemIds is empty or omitted.
 */
export function deriveSessionQueryVector(
  sessionItemIds?: string[],
  userId = 'anonymous'
): Float32Array {
  const validSessionItems = (sessionItemIds ?? [])
    .map((id) => id.trim())
    .filter((id) => id.length > 0);

  if (validSessionItems.length === 0) {
    return l2Normalize(seedToVector(`user-intent:${userId}`));
  }

  const composite = new Float32Array(EMBEDDING_DIMENSION);
  let totalWeight = 0;

  for (let idx = 0; idx < validSessionItems.length; idx++) {
    const weight = 1.0 / (idx + 1);
    const itemVec = seedToVector(`item-embedding:${validSessionItems[idx]}`);
    for (let d = 0; d < EMBEDDING_DIMENSION; d++) {
      composite[d] += itemVec[d] * weight;
    }
    totalWeight += weight;
  }

  if (totalWeight > 0) {
    for (let d = 0; d < EMBEDDING_DIMENSION; d++) {
      composite[d] /= totalWeight;
    }
  }

  return l2Normalize(composite);
}

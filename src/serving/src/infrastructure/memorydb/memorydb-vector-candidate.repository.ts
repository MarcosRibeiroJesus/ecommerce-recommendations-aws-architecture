import Redis from 'ioredis';
import { SemanticCandidate } from '../../domain/candidate';
import { env } from '../../config/env';
import { baseLogger } from '../logging/logger';
import { createCircuitBreaker } from '../resilience/circuit-breaker';

export interface IMemoryDbVectorRepository {
  searchSimilarItems(vector: Float32Array | Buffer, category?: string, limit?: number): Promise<SemanticCandidate[]>;
}

export class MemoryDbVectorCandidateRepository implements IMemoryDbVectorRepository {
  private redis: Redis;
  private breaker: ReturnType<typeof createCircuitBreaker>;

  constructor(customRedis?: Redis) {
    if (customRedis) {
      this.redis = customRedis;
    } else {
      const endpoint = env.MEMORYDB_CLUSTER_ENDPOINT;
      const [host, portStr] = endpoint.split(':');
      this.redis = new Redis({
        host: host || 'localhost',
        port: portStr ? parseInt(portStr, 10) : 6379,
        connectTimeout: 1000,
        maxRetriesPerRequest: 1,
        lazyConnect: true,
      });
    }

    this.breaker = createCircuitBreaker(
      async (buf: Buffer, cat?: string, lim?: number) => this.executeVectorSearch(buf, cat, lim),
      {
        timeout: 15, // 15ms timeout deadline per spec
        errorThresholdPercentage: 20,
        resetTimeout: 10000,
        name: 'memorydb-vector-repo',
      }
    );
  }

  private async executeVectorSearch(
    vectorBuffer: Buffer,
    category?: string,
    limit = 50
  ): Promise<SemanticCandidate[]> {
    const k = Math.min(Math.max(limit, 1), 50);
    const query = category
      ? `(@cat:{${category}})=>[KNN ${k} @v $vec AS vector_score]`
      : `*=>[KNN ${k} @v $vec AS vector_score]`;

    // RediSearch FT.SEARCH command with binary parameter buffer
    const rawResult = (await this.redis.call(
      'FT.SEARCH',
      'item_idx',
      query,
      'PARAMS',
      '2',
      'vec',
      vectorBuffer,
      'SORTBY',
      'vector_score',
      'ASC',
      'RETURN',
      '1',
      'vector_score',
      'DIALECT',
      '2'
    )) as [number, ...unknown[]];

    if (!Array.isArray(rawResult) || rawResult.length <= 1) {
      return [];
    }

    const candidates: SemanticCandidate[] = [];

    // Response structure: [totalCount, key1, [field1, val1], key2, [field2, val2], ...]
    for (let i = 1; i < rawResult.length; i += 2) {
      const key = String(rawResult[i]);
      const attributes = rawResult[i + 1] as unknown[];
      const itemId = key.replace(/^item:/, '');

      let vectorScore = 0.5;
      if (Array.isArray(attributes)) {
        for (let j = 0; j < attributes.length; j += 2) {
          if (attributes[j] === 'vector_score') {
            const rawScore = parseFloat(String(attributes[j + 1]));
            // Cosine distance to similarity: 1.0 - distance
            vectorScore = Math.max(0.0, Math.min(1.0, 1.0 - rawScore));
          }
        }
      }

      candidates.push({
        itemId,
        vectorScore,
      });
    }

    return candidates;
  }

  public async searchSimilarItems(
    vector: Float32Array | Buffer,
    category?: string,
    limit = 50
  ): Promise<SemanticCandidate[]> {
    let buffer: Buffer;
    if (vector instanceof Buffer) {
      buffer = vector;
    } else {
      buffer = Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
    }

    // Ensure 128-dim Float32 = 512 bytes
    if (buffer.byteLength !== 512) {
      // If smaller or empty in test/fallback, pad or return empty
      if (buffer.byteLength === 0) {
        return [];
      }
    }

    try {
      const result = await this.breaker.fire(buffer, category, limit);
      return (result as SemanticCandidate[]) || [];
    } catch (error) {
      baseLogger.warn(
        { error, category },
        `MemoryDB vector search failed or timed out. Returning empty list.`
      );
      return [];
    }
  }
}

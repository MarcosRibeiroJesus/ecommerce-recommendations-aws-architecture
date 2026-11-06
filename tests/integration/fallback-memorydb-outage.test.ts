import { describe, it, expect, vi } from 'vitest';
import { GetRecommendationsUseCase } from '../../src/serving/src/application/get-recommendations.use-case';
import { IDynamoDbBatchRepository } from '../../src/serving/src/infrastructure/dynamodb/dynamodb-batch-candidate.repository';
import { IMemoryDbVectorRepository } from '../../src/serving/src/infrastructure/memorydb/memorydb-vector-candidate.repository';
import { ISageMakerScoringClient } from '../../src/serving/src/infrastructure/sagemaker/sagemaker-scoring.client';

describe('Fallback MemoryDB Outage (Integration)', () => {
  it('should fall back to pure batch candidates with provenance "batch" when MemoryDB is unreachable', async () => {
    const mockDynamoRepo: IDynamoDbBatchRepository = {
      getBatchCandidates: vi.fn().mockResolvedValue([
        { itemId: 'BATCH-1', score: 0.9, rank: 1, title: 'Item 1', priceCents: 1500 },
        { itemId: 'BATCH-2', score: 0.8, rank: 2, title: 'Item 2', priceCents: 2500 },
      ]),
    };

    // MemoryDB fails with connection timeout / error
    const mockMemoryDbRepo: IMemoryDbVectorRepository = {
      searchSimilarItems: vi.fn().mockRejectedValue(new Error('Connection to MemoryDB Redis refused')),
    };

    const mockSageMakerClient: ISageMakerScoringClient = {
      scoreCandidates: vi.fn().mockImplementation(async (input) => {
        return input.candidates.map((c: { itemId: string }) => ({
          itemId: c.itemId,
          score: c.itemId === 'BATCH-1' ? 0.95 : 0.85,
        }));
      }),
    };

    const useCase = new GetRecommendationsUseCase({
      batchRepo: mockDynamoRepo,
      vectorRepo: mockMemoryDbRepo,
      scoringClient: mockSageMakerClient,
    });

    const response = await useCase.execute({
      userId: 'u-12345',
      limit: 2,
    });

    expect(response.degradedMode).toBe(true);
    expect(response.recommendations).toHaveLength(2);
    expect(response.recommendations[0].provenance).toBe('batch');
    expect(response.recommendations[1].provenance).toBe('batch');
  });
});

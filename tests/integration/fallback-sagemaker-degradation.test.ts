import { describe, it, expect, vi } from 'vitest';
import { GetRecommendationsUseCase } from '../../src/serving/src/application/get-recommendations.use-case';
import { IDynamoDbBatchRepository } from '../../src/serving/src/infrastructure/dynamodb/dynamodb-batch-candidate.repository';
import { IMemoryDbVectorRepository } from '../../src/serving/src/infrastructure/memorydb/memorydb-vector-candidate.repository';
import { ISageMakerScoringClient } from '../../src/serving/src/infrastructure/sagemaker/sagemaker-scoring.client';

describe('Fallback SageMaker Degradation (Integration)', () => {
  it('should fall back to heuristic reranking and set degradedMode: true when SageMaker times out or throws', async () => {
    const mockDynamoRepo: IDynamoDbBatchRepository = {
      getBatchCandidates: vi.fn().mockResolvedValue([
        { itemId: 'PROD-A', score: 0.8, rank: 1, title: 'Item A', priceCents: 1000 },
        { itemId: 'PROD-B', score: 0.6, rank: 2, title: 'Item B', priceCents: 2000 },
      ]),
    };

    const mockMemoryDbRepo: IMemoryDbVectorRepository = {
      searchSimilarItems: vi.fn().mockResolvedValue([
        { itemId: 'PROD-A', vectorScore: 0.9, title: 'Item A', priceCents: 1000 },
        { itemId: 'PROD-C', vectorScore: 0.7, title: 'Item C', priceCents: 3000 },
      ]),
    };

    // SageMaker throws timeout error (>35ms)
    const mockSageMakerClient: ISageMakerScoringClient = {
      scoreCandidates: vi.fn().mockRejectedValue(new Error('SageMaker invocation timed out after 35ms')),
    };

    const useCase = new GetRecommendationsUseCase({
      batchRepo: mockDynamoRepo,
      vectorRepo: mockMemoryDbRepo,
      scoringClient: mockSageMakerClient,
    });

    const response = await useCase.execute({
      userId: 'u-12345',
      limit: 3,
    });

    expect(response.degradedMode).toBe(true);
    expect(response.recommendations).toHaveLength(3);

    // Heuristic score for PROD-A: (0.6 * 0.8) + (0.4 * 0.9) = 0.48 + 0.36 = 0.84
    // PROD-C: vector-only -> 0.7
    // PROD-B: batch-only -> 0.6
    expect(response.recommendations[0].itemId).toBe('PROD-A');
    expect(response.recommendations[0].provenance).toBe('hybrid');
    expect(response.recommendations[0].rank).toBe(1);
    expect(response.recommendations[0].score).toBeCloseTo(0.84);

    expect(response.recommendations[1].itemId).toBe('PROD-C');
    expect(response.recommendations[1].provenance).toBe('realtime');
    expect(response.recommendations[1].rank).toBe(2);

    expect(response.recommendations[2].itemId).toBe('PROD-B');
    expect(response.recommendations[2].provenance).toBe('batch');
    expect(response.recommendations[2].rank).toBe(3);
  });
});

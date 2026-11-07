import { describe, it, expect, vi } from 'vitest';
import { GetRecommendationsUseCase } from '../../src/serving/src/application/get-recommendations.use-case';
import { IDynamoDbBatchRepository } from '../../src/serving/src/infrastructure/dynamodb/dynamodb-batch-candidate.repository';
import { IMemoryDbVectorRepository } from '../../src/serving/src/infrastructure/memorydb/memorydb-vector-candidate.repository';
import { ISageMakerScoringClient } from '../../src/serving/src/infrastructure/sagemaker/sagemaker-scoring.client';

describe('Fallback DynamoDB Outage or Empty Profile (Integration)', () => {
  it('should fall back to real-time semantic vector candidates with provenance "realtime" when DynamoDB is unavailable or empty', async () => {
    // DynamoDB returns empty (cold start) or throws
    const mockDynamoRepo: IDynamoDbBatchRepository = {
      getBatchCandidates: vi.fn().mockRejectedValue(new Error('DynamoDB ServiceUnavailable')),
    };

    const mockMemoryDbRepo: IMemoryDbVectorRepository = {
      searchSimilarItems: vi.fn().mockResolvedValue([
        { itemId: 'VEC-1', vectorScore: 0.92, title: 'Vector Item 1', priceCents: 1999 },
        { itemId: 'VEC-2', vectorScore: 0.81, title: 'Vector Item 2', priceCents: 2999 },
      ]),
    };

    const mockSageMakerClient: ISageMakerScoringClient = {
      scoreCandidates: vi.fn().mockImplementation(async (input) => {
        return input.candidates.map((c: { itemId: string }) => ({
          itemId: c.itemId,
          score: c.itemId === 'VEC-1' ? 0.94 : 0.82,
        }));
      }),
    };

    const useCase = new GetRecommendationsUseCase({
      batchRepo: mockDynamoRepo,
      vectorRepo: mockMemoryDbRepo,
      scoringClient: mockSageMakerClient,
    });

    const response = await useCase.execute({
      userId: 'u-cold-start-999',
      limit: 2,
    });

    expect(response.degradedMode).toBe(true);
    expect(response.recommendations).toHaveLength(2);
    expect(response.recommendations[0].provenance).toBe('realtime');
    expect(response.recommendations[1].provenance).toBe('realtime');
  });
});

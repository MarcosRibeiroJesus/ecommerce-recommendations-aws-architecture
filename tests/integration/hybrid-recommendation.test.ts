import { describe, it, expect, vi } from 'vitest';
import { GetRecommendationsUseCase } from '../../src/serving/src/application/get-recommendations.use-case';
import { IDynamoDbBatchRepository } from '../../src/serving/src/infrastructure/dynamodb/dynamodb-batch-candidate.repository';
import { IMemoryDbVectorRepository } from '../../src/serving/src/infrastructure/memorydb/memorydb-vector-candidate.repository';
import { ISageMakerScoringClient } from '../../src/serving/src/infrastructure/sagemaker/sagemaker-scoring.client';

describe('Hybrid Recommendations End-to-End Flow (Integration)', () => {
  it('should retrieve batch and vector candidates, merge them, score via SageMaker, and return ranked recommendations', async () => {
    // Mock DynamoDB Batch Repository
    const mockDynamoRepo: IDynamoDbBatchRepository = {
      getBatchCandidates: vi.fn().mockResolvedValue([
        { itemId: 'PROD-1', score: 0.88, rank: 1, title: 'Ergonomic Keyboard', priceCents: 4999, category: 'Computers' },
        { itemId: 'PROD-2', score: 0.82, rank: 2, title: 'USB-C Cable', priceCents: 999, category: 'Accessories' },
      ]),
    };

    // Mock MemoryDB Vector Repository
    const mockMemoryDbRepo: IMemoryDbVectorRepository = {
      searchSimilarItems: vi.fn().mockResolvedValue([
        { itemId: 'PROD-1', vectorScore: 0.95, title: 'Ergonomic Keyboard', priceCents: 4999, category: 'Computers' },
        { itemId: 'PROD-3', vectorScore: 0.79, title: 'Vertical Mouse', priceCents: 2999, category: 'Computers' },
      ]),
    };

    // Mock SageMaker Scoring Client
    const mockSageMakerClient: ISageMakerScoringClient = {
      scoreCandidates: vi.fn().mockImplementation(async (input) => {
        return input.candidates.map((c: { itemId: string }) => {
          let score = 0.5;
          if (c.itemId === 'PROD-1') score = 0.98;
          if (c.itemId === 'PROD-3') score = 0.85;
          if (c.itemId === 'PROD-2') score = 0.75;
          return { itemId: c.itemId, score };
        });
      }),
    };

    const useCase = new GetRecommendationsUseCase({
      batchRepo: mockDynamoRepo,
      vectorRepo: mockMemoryDbRepo,
      scoringClient: mockSageMakerClient,
    });

    const response = await useCase.execute({
      userId: 'u-12345',
      limit: 3,
      requestId: 'req-test-123',
    });

    expect(response.userId).toBe('u-12345');
    expect(response.degradedMode).toBe(false);
    expect(response.recommendations).toHaveLength(3);

    // Verify ordering by SageMaker model score (PROD-1: 0.98, PROD-3: 0.85, PROD-2: 0.75)
    expect(response.recommendations[0].itemId).toBe('PROD-1');
    expect(response.recommendations[0].rank).toBe(1);
    expect(response.recommendations[0].provenance).toBe('hybrid'); // In both batch & vector
    expect(response.recommendations[0].score).toBe(0.98);

    expect(response.recommendations[1].itemId).toBe('PROD-3');
    expect(response.recommendations[1].rank).toBe(2);
    expect(response.recommendations[1].provenance).toBe('realtime'); // Vector only
    expect(response.recommendations[1].score).toBe(0.85);

    expect(response.recommendations[2].itemId).toBe('PROD-2');
    expect(response.recommendations[2].rank).toBe(3);
    expect(response.recommendations[2].provenance).toBe('batch'); // Batch only
    expect(response.recommendations[2].score).toBe(0.75);
  });
});

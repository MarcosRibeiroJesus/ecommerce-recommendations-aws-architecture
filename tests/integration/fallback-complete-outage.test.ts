import { describe, it, expect, vi } from 'vitest';
import { GetRecommendationsUseCase } from '../../src/serving/src/application/get-recommendations.use-case';
import { IDynamoDbBatchRepository } from '../../src/serving/src/infrastructure/dynamodb/dynamodb-batch-candidate.repository';
import { IMemoryDbVectorRepository } from '../../src/serving/src/infrastructure/memorydb/memorydb-vector-candidate.repository';
import { ISageMakerScoringClient } from '../../src/serving/src/infrastructure/sagemaker/sagemaker-scoring.client';

describe('Fallback Complete Downstream Outage (Integration)', () => {
  it('should fall back to curated popular items with provenance "fallback" when all downstream sources fail', async () => {
    const mockDynamoRepo: IDynamoDbBatchRepository = {
      getBatchCandidates: vi.fn().mockRejectedValue(new Error('DynamoDB Unreachable')),
    };

    const mockMemoryDbRepo: IMemoryDbVectorRepository = {
      searchSimilarItems: vi.fn().mockRejectedValue(new Error('MemoryDB Unreachable')),
    };

    const mockSageMakerClient: ISageMakerScoringClient = {
      scoreCandidates: vi.fn().mockRejectedValue(new Error('SageMaker Unreachable')),
    };

    const useCase = new GetRecommendationsUseCase({
      batchRepo: mockDynamoRepo,
      vectorRepo: mockMemoryDbRepo,
      scoringClient: mockSageMakerClient,
    });

    const response = await useCase.execute({
      userId: 'u-12345',
      limit: 5,
    });

    expect(response.degradedMode).toBe(true);
    expect(response.recommendations.length).toBeGreaterThan(0);
    expect(response.recommendations[0].provenance).toBe('fallback');
  });
});

import { describe, it, expect, vi } from 'vitest';
import { GetRecommendationsUseCase } from '../../src/serving/src/application/get-recommendations.use-case';
import { IDynamoDbBatchRepository } from '../../src/serving/src/infrastructure/dynamodb/dynamodb-batch-candidate.repository';
import { IMemoryDbVectorRepository } from '../../src/serving/src/infrastructure/memorydb/memorydb-vector-candidate.repository';
import { ISageMakerScoringClient } from '../../src/serving/src/infrastructure/sagemaker/sagemaker-scoring.client';
import { IInventoryEligibilityRepository } from '../../src/serving/src/infrastructure/cache/inventory-eligibility.repository';

describe('Fallback Complete Downstream Outage & Eligibility Enforcement (Integration)', () => {
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
    expect(response.recommendations.length).toBe(5);
    expect(response.recommendations[0].provenance).toBe('fallback');
  });

  it('should enforce business filter rules (out-of-stock & recent purchases) even on curated fallback items (C7)', async () => {
    const mockDynamoRepo: IDynamoDbBatchRepository = {
      getBatchCandidates: vi.fn().mockRejectedValue(new Error('DynamoDB Unreachable')),
    };

    const mockMemoryDbRepo: IMemoryDbVectorRepository = {
      searchSimilarItems: vi.fn().mockRejectedValue(new Error('MemoryDB Unreachable')),
    };

    const mockSageMakerClient: ISageMakerScoringClient = {
      scoreCandidates: vi.fn().mockRejectedValue(new Error('SageMaker Unreachable')),
    };

    const mockInventoryRepo: IInventoryEligibilityRepository = {
      checkStock: vi.fn().mockResolvedValue(
        new Map<string, boolean>([
          ['SKU-FALLBACK-01', false], // Out of stock!
          ['SKU-FALLBACK-02', true],
          ['SKU-FALLBACK-03', true],
        ])
      ),
      getRecentPurchases: vi.fn().mockResolvedValue([
        { itemId: 'SKU-FALLBACK-02', purchaseTimestamp: Date.now() - 2 * 24 * 60 * 60 * 1000 }, // Purchased 2 days ago!
      ]),
    };

    const useCase = new GetRecommendationsUseCase({
      batchRepo: mockDynamoRepo,
      vectorRepo: mockMemoryDbRepo,
      scoringClient: mockSageMakerClient,
      inventoryRepo: mockInventoryRepo,
    });

    const response = await useCase.execute({
      userId: 'u-12345',
      limit: 5,
    });

    expect(response.degradedMode).toBe(true);
    const returnedIds = response.recommendations.map((r) => r.itemId);
    expect(returnedIds).not.toContain('SKU-FALLBACK-01');
    expect(returnedIds).not.toContain('SKU-FALLBACK-02');
    expect(returnedIds[0]).toBe('SKU-FALLBACK-03');
  });
});

import { describe, it, expect, vi } from 'vitest';
import { GetRecommendationsUseCase } from '../../src/serving/src/application/get-recommendations.use-case';
import { IDynamoDbBatchRepository } from '../../src/serving/src/infrastructure/dynamodb/dynamodb-batch-candidate.repository';
import { IMemoryDbVectorRepository } from '../../src/serving/src/infrastructure/memorydb/memorydb-vector-candidate.repository';
import { ISageMakerScoringClient } from '../../src/serving/src/infrastructure/sagemaker/sagemaker-scoring.client';
import { BusinessFilterEngine } from '../../src/serving/src/application/business-filter-engine';
import { OutOfStockFilterRule, RecentPurchaseSuppressionRule } from '../../src/serving/src/domain/filter-rule';
import { IInventoryEligibilityRepository } from '../../src/serving/src/infrastructure/cache/inventory-eligibility.repository';

describe('Business Filter Enforcement in Serving Pipeline (Integration)', () => {
  it('should strictly exclude out-of-stock and recently purchased items even if they scored highest in SageMaker', async () => {
    const mockDynamoRepo: IDynamoDbBatchRepository = {
      getBatchCandidates: vi.fn().mockResolvedValue([
        { itemId: 'OUT-OF-STOCK-HOT-ITEM', score: 0.99, rank: 1, title: 'Rare GPU', priceCents: 99999 },
        { itemId: 'ALREADY-BOUGHT-ITEM', score: 0.98, rank: 2, title: 'Smart TV', priceCents: 49999 },
        { itemId: 'ELIGIBLE-IN-STOCK-ITEM', score: 0.75, rank: 3, title: 'USB Hub', priceCents: 1999 },
      ]),
    };

    const mockMemoryDbRepo: IMemoryDbVectorRepository = {
      searchSimilarItems: vi.fn().mockResolvedValue([]),
    };

    const mockSageMakerClient: ISageMakerScoringClient = {
      scoreCandidates: vi.fn().mockImplementation(async (input) => {
        // Model would assign 0.999 to OUT-OF-STOCK item if it wasn't filtered
        return input.candidates.map((c: { itemId: string }) => ({
          itemId: c.itemId,
          score: 0.999,
        }));
      }),
    };

    const mockInventoryRepo: IInventoryEligibilityRepository = {
      checkStock: vi.fn().mockImplementation(async (itemIds: string[]) => {
        const stockMap = new Map<string, boolean>();
        for (const id of itemIds) {
          stockMap.set(id, id !== 'OUT-OF-STOCK-HOT-ITEM');
        }
        return stockMap;
      }),
      getRecentPurchases: vi.fn().mockResolvedValue([
        { itemId: 'ALREADY-BOUGHT-ITEM', purchaseTimestamp: Date.now() - 2 * 86400000 }, // 2 days ago
      ]),
    };

    const filterEngine = new BusinessFilterEngine([
      new OutOfStockFilterRule(),
      new RecentPurchaseSuppressionRule(),
    ]);

    const useCase = new GetRecommendationsUseCase({
      batchRepo: mockDynamoRepo,
      vectorRepo: mockMemoryDbRepo,
      scoringClient: mockSageMakerClient,
      filterEngine,
      inventoryRepo: mockInventoryRepo,
    });

    const response = await useCase.execute({
      userId: 'u-customer-101',
      limit: 10,
    });

    const returnedItemIds = response.recommendations.map((r) => r.itemId);

    expect(returnedItemIds).not.toContain('OUT-OF-STOCK-HOT-ITEM');
    expect(returnedItemIds).not.toContain('ALREADY-BOUGHT-ITEM');
    expect(returnedItemIds).toContain('ELIGIBLE-IN-STOCK-ITEM');
  });
});

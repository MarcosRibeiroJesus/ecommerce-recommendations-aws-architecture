import { randomUUID } from 'crypto';
import { RecommendedItem, LimitSchema, UserIdSchema, MergedCandidate } from '../domain/candidate';
import { IDynamoDbBatchRepository } from '../infrastructure/dynamodb/dynamodb-batch-candidate.repository';
import { IMemoryDbVectorRepository } from '../infrastructure/memorydb/memorydb-vector-candidate.repository';
import { ISageMakerScoringClient } from '../infrastructure/sagemaker/sagemaker-scoring.client';
import { ICuratedFallbackProvider, CuratedFallbackProvider } from '../infrastructure/fallback/curated-fallback.provider';
import { ICloudWatchMetricsPublisher } from '../infrastructure/monitoring/cloudwatch-metrics';
import { IInventoryEligibilityRepository } from '../infrastructure/cache/inventory-eligibility.repository';
import { BusinessFilterEngine } from './business-filter-engine';
import { OutOfStockFilterRule, RecentPurchaseSuppressionRule } from '../domain/filter-rule';
import { mergeCandidates } from './candidate-merger';
import { SageMakerReranker } from './reranker';
import { HeuristicReranker } from './heuristic-reranker';
import { baseLogger, StageTimer } from '../infrastructure/logging/logger';

export interface RecommendationRequestParams {
  userId: string;
  limit?: number;
  category?: string;
  sessionItemIds?: string[];
  userCountry?: string;
  requestId?: string;
}

export interface RecommendationResponse {
  requestId: string;
  userId: string;
  timestamp: string;
  degradedMode: boolean;
  executionDurationMs: number;
  recommendations: RecommendedItem[];
}

export interface IGetRecommendationsUseCase {
  execute(params: RecommendationRequestParams): Promise<RecommendationResponse>;
}

export interface UseCaseDependencies {
  batchRepo: IDynamoDbBatchRepository;
  vectorRepo: IMemoryDbVectorRepository;
  scoringClient: ISageMakerScoringClient;
  fallbackProvider?: ICuratedFallbackProvider;
  metricsPublisher?: ICloudWatchMetricsPublisher;
  filterEngine?: BusinessFilterEngine;
  inventoryRepo?: IInventoryEligibilityRepository;
}

export class GetRecommendationsUseCase implements IGetRecommendationsUseCase {
  private batchRepo: IDynamoDbBatchRepository;
  private vectorRepo: IMemoryDbVectorRepository;
  private reranker: SageMakerReranker;
  private fallbackProvider: ICuratedFallbackProvider;
  private metricsPublisher?: ICloudWatchMetricsPublisher;
  private filterEngine: BusinessFilterEngine;
  private inventoryRepo?: IInventoryEligibilityRepository;

  constructor(deps: UseCaseDependencies) {
    this.batchRepo = deps.batchRepo;
    this.vectorRepo = deps.vectorRepo;
    this.reranker = new SageMakerReranker(deps.scoringClient);
    this.fallbackProvider = deps.fallbackProvider || new CuratedFallbackProvider();
    this.metricsPublisher = deps.metricsPublisher;
    this.filterEngine =
      deps.filterEngine ||
      new BusinessFilterEngine([
        new OutOfStockFilterRule(),
        new RecentPurchaseSuppressionRule(),
      ]);
    this.inventoryRepo = deps.inventoryRepo;
  }

  public async execute(params: RecommendationRequestParams): Promise<RecommendationResponse> {
    const startTime = process.hrtime.bigint();
    const requestId = params.requestId || `req-${randomUUID()}`;
    const logger = baseLogger.child({ requestId, userId: params.userId });

    // 1. Validation
    UserIdSchema.parse(params.userId);
    const limit = LimitSchema.parse(params.limit ?? 10);

    let degradedMode = false;

    // 2. Parallel candidate retrieval
    const retrievalTimer = new StageTimer(logger, 'parallel-retrieval');
    const [batchResult, vectorResult] = await Promise.allSettled([
      this.batchRepo.getBatchCandidates(params.userId),
      this.vectorRepo.searchSimilarItems(new Float32Array(128), params.category, 50),
    ]);

    const batchCandidates = batchResult.status === 'fulfilled' ? batchResult.value : [];
    const vectorCandidates = vectorResult.status === 'fulfilled' ? vectorResult.value : [];

    if (batchResult.status === 'rejected') {
      degradedMode = true;
      void this.metricsPublisher?.publishDynamoDbFallback();
      logger.warn({ err: batchResult.reason }, 'DynamoDB batch candidate retrieval failed');
    }

    if (vectorResult.status === 'rejected') {
      degradedMode = true;
      void this.metricsPublisher?.publishMemoryDbFallback();
      logger.warn({ err: vectorResult.reason }, 'MemoryDB vector search failed');
    }

    retrievalTimer.end({
      batchCount: batchCandidates.length,
      vectorCount: vectorCandidates.length,
      degradedMode,
    });

    // 3. Candidate Merging & Deduplication
    const mergeTimer = new StageTimer(logger, 'candidate-merging');
    const mergedCandidates = mergeCandidates(batchCandidates, vectorCandidates);
    mergeTimer.end({ mergedCount: mergedCandidates.length });

    // 4. Inventory lookup & Business Filtering
    const filterTimer = new StageTimer(logger, 'business-filtering');
    let filteredCandidates: MergedCandidate[] = mergedCandidates;

    if (this.inventoryRepo && mergedCandidates.length > 0) {
      const itemIds = mergedCandidates.map((c) => c.itemId);
      const [stockMap, recentPurchases] = await Promise.all([
        this.inventoryRepo.checkStock(itemIds),
        this.inventoryRepo.getRecentPurchases(params.userId),
      ]);

      // Enrich candidates with real-time stock status
      for (const candidate of mergedCandidates) {
        if (stockMap.has(candidate.itemId)) {
          candidate.inStock = stockMap.get(candidate.itemId);
        }
      }

      const filterResult = this.filterEngine.filter(mergedCandidates, {
        userId: params.userId,
        userCountry: params.userCountry,
        recentPurchases,
      });
      filteredCandidates = filterResult.candidates;
    } else {
      const filterResult = this.filterEngine.filter(mergedCandidates, {
        userId: params.userId,
        userCountry: params.userCountry,
      });
      filteredCandidates = filterResult.candidates;
    }
    filterTimer.end({
      beforeCount: mergedCandidates.length,
      afterCount: filteredCandidates.length,
    });

    let recommendations: RecommendedItem[] = [];

    // Complete downstream outage or empty filtered candidate check
    if (filteredCandidates.length === 0) {
      degradedMode = true;
      void this.metricsPublisher?.publishDegradedMode();
      logger.warn('Eligible candidate pool is empty; triggering curated fallback provider');
      recommendations = this.fallbackProvider.getFallbackRecommendations(limit);
    } else {
      // 5. ML Reranking via SageMaker (with Graceful Degradation)
      const rerankTimer = new StageTimer(logger, 'sagemaker-reranking');
      try {
        recommendations = await this.reranker.rerank({
          userId: params.userId,
          candidates: filteredCandidates,
          limit,
          sessionItemIds: params.sessionItemIds,
        });
      } catch (error) {
        degradedMode = true;
        void this.metricsPublisher?.publishSageMakerFallback();
        void this.metricsPublisher?.publishDegradedMode();
        logger.warn(
          { error },
          'SageMaker scoring unavailable or timed out; activating weighted heuristic fallback'
        );

        // Fallback to weighted heuristic reranker: (0.6 * batch) + (0.4 * vector)
        recommendations = HeuristicReranker.rerank(filteredCandidates, limit);
      }
      rerankTimer.end({ finalCount: recommendations.length });
    }

    if (degradedMode) {
      void this.metricsPublisher?.publishDegradedMode();
    }

    const endTime = process.hrtime.bigint();
    const executionDurationMs = Math.round(Number(endTime - startTime) / 1_000_000);

    return {
      requestId,
      userId: params.userId,
      timestamp: new Date().toISOString(),
      degradedMode,
      executionDurationMs,
      recommendations,
    };
  }
}

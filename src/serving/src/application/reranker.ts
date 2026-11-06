import { MergedCandidate, RecommendedItem } from '../domain/candidate';
import { ISageMakerScoringClient } from '../infrastructure/sagemaker/sagemaker-scoring.client';

export interface RerankOptions {
  userId: string;
  candidates: MergedCandidate[];
  limit: number;
  sessionItemIds?: string[];
}

export class SageMakerReranker {
  private scoringClient: ISageMakerScoringClient;

  constructor(scoringClient: ISageMakerScoringClient) {
    this.scoringClient = scoringClient;
  }

  public async rerank(options: RerankOptions): Promise<RecommendedItem[]> {
    const { userId, candidates, limit, sessionItemIds } = options;

    if (!candidates || candidates.length === 0) {
      return [];
    }

    const candidateInputs = candidates.map((c) => ({
      itemId: c.itemId,
      initialScore: c.initialCombinedScore,
      provenance: c.provenance === 'fallback' ? 'batch' : c.provenance,
      category: c.category,
      priceCents: c.priceCents,
    }));

    const predictions = await this.scoringClient.scoreCandidates({
      userId,
      sessionContext: sessionItemIds ? { recentItemIds: sessionItemIds } : undefined,
      candidates: candidateInputs,
    });

    const predictionMap = new Map<string, number>();
    for (const pred of predictions) {
      predictionMap.set(pred.itemId, pred.score);
    }

    // Join with metadata and assign scores
    const scoredCandidates = candidates.map((c) => {
      const modelScore = predictionMap.get(c.itemId) ?? c.initialCombinedScore;
      return {
        ...c,
        finalScore: modelScore,
      };
    });

    // Sort descending by finalScore
    scoredCandidates.sort((a, b) => b.finalScore - a.finalScore);

    // Truncate to limit and map to RecommendedItem
    const topN = scoredCandidates.slice(0, limit);

    return topN.map((item, index) => ({
      itemId: item.itemId,
      rank: index + 1,
      score: item.finalScore,
      provenance: item.provenance,
      title: item.title || `Product ${item.itemId}`,
      priceCents: item.priceCents ?? 0,
      category: item.category,
    }));
  }
}

import { MergedCandidate, RecommendedItem } from '../domain/candidate';

export class HeuristicReranker {
  public static rerank(candidates: MergedCandidate[], limit: number): RecommendedItem[] {
    const scoredCandidates = candidates.map((c) => {
      let score = c.initialCombinedScore;

      if (c.batchScore !== undefined && c.vectorScore !== undefined) {
        // Weighted heuristic: 60% batch collaborative filtering, 40% real-time semantic vector
        score = 0.6 * c.batchScore + 0.4 * c.vectorScore;
      } else if (c.batchScore !== undefined) {
        score = c.batchScore;
      } else if (c.vectorScore !== undefined) {
        score = c.vectorScore;
      }

      return {
        ...c,
        heuristicScore: Math.round(score * 1000) / 1000,
      };
    });

    // Sort descending by heuristic score
    scoredCandidates.sort((a, b) => b.heuristicScore - a.heuristicScore);

    const topN = scoredCandidates.slice(0, limit);

    return topN.map((item, index) => ({
      itemId: item.itemId,
      rank: index + 1,
      score: item.heuristicScore,
      provenance: item.provenance,
      title: item.title || `Product ${item.itemId}`,
      priceCents: item.priceCents ?? 0,
      category: item.category,
    }));
  }
}

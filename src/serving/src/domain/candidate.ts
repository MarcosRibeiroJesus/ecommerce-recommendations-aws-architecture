import { z } from 'zod';

export const CandidateProvenanceEnum = z.enum(['batch', 'realtime', 'hybrid', 'fallback']);
export type CandidateProvenance = z.infer<typeof CandidateProvenanceEnum>;

export const UserIdSchema = z
  .string()
  .min(1)
  .regex(/^[a-zA-Z0-9_-]+$/, "User ID must match pattern '^[a-zA-Z0-9_\\-]+$'");

export const LimitSchema = z.number().int().min(1).max(50).default(10);

export const MergedCandidateSchema = z.object({
  itemId: z.string().min(1),
  provenance: CandidateProvenanceEnum,
  batchScore: z.number().min(0.0).max(1.0).optional(),
  batchRank: z.number().int().min(1).optional(),
  vectorScore: z.number().min(0.0).max(1.0).optional(),
  initialCombinedScore: z.number().min(0.0).max(1.0),
  category: z.string().optional(),
  priceCents: z.number().int().nonnegative().optional(),
  title: z.string().optional(),
  inStock: z.boolean().default(true).optional(),
});

export type MergedCandidate = z.infer<typeof MergedCandidateSchema>;

export const RecommendedItemSchema = z.object({
  itemId: z.string(),
  rank: z.number().int().min(1),
  score: z.number().min(0.0).max(1.0),
  provenance: CandidateProvenanceEnum,
  title: z.string(),
  priceCents: z.number().int().nonnegative(),
  category: z.string().optional(),
});

export type RecommendedItem = z.infer<typeof RecommendedItemSchema>;

export interface BatchCandidate {
  itemId: string;
  score: number;
  rank: number;
  modelId?: string;
  category?: string;
  priceCents?: number;
  title?: string;
}

export interface SemanticCandidate {
  itemId: string;
  vectorScore: number;
  category?: string;
  priceCents?: number;
  title?: string;
}

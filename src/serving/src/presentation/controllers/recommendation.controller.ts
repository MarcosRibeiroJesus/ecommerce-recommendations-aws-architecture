import { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { IGetRecommendationsUseCase } from '../../application/get-recommendations.use-case';

const QuerySchema = z.object({
  userId: z
    .string({ required_error: "Parameter 'userId' is required" })
    .min(1)
    .regex(/^[a-zA-Z0-9_-]+$/, "Parameter 'userId' must match pattern '^[a-zA-Z0-9_\\-]+$'"),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 10))
    .refine((val) => !isNaN(val) && val >= 1 && val <= 50, {
      message: "Parameter 'limit' must be an integer between 1 and 50",
    }),
  category: z.string().optional(),
  sessionItemIds: z.string().optional(),
});

export class RecommendationController {
  private useCase: IGetRecommendationsUseCase;

  constructor(useCase: IGetRecommendationsUseCase) {
    this.useCase = useCase;
  }

  public async getRecommendations(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const parseResult = QuerySchema.safeParse(req.query);

    if (!parseResult.success) {
      const firstError = parseResult.error.errors[0]?.message || 'Validation error';
      reply.status(400).send({
        error: 'Bad Request',
        message: firstError,
        requestId: req.id,
      });
      return;
    }

    const { userId, limit, category, sessionItemIds } = parseResult.data;

    const parsedSessionItems = sessionItemIds
      ? sessionItemIds.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
      : undefined;

    try {
      const response = await this.useCase.execute({
        userId,
        limit,
        category,
        sessionItemIds: parsedSessionItems,
        requestId: req.id,
      });

      reply.status(200).send(response);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Internal error processing recommendations';
      reply.status(500).send({
        error: 'Internal Server Error',
        message,
        requestId: req.id,
      });
    }
  }
}

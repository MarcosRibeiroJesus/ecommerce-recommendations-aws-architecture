import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildServer } from '../../src/serving/src/presentation/server';
import { IGetRecommendationsUseCase } from '../../src/serving/src/application/get-recommendations.use-case';

describe('Recommendations API Contract Tests (OpenAPI 3.0)', () => {
  let app: FastifyInstance;

  const mockUseCase: IGetRecommendationsUseCase = {
    execute: async (params) => {
      return {
        requestId: params.requestId,
        userId: params.userId,
        timestamp: new Date().toISOString(),
        degradedMode: false,
        executionDurationMs: 35,
        recommendations: [
          {
            itemId: 'SKU-1001',
            rank: 1,
            score: 0.95,
            provenance: 'hybrid',
            title: 'Wireless Headphones',
            priceCents: 9999,
            category: 'Electronics',
          },
        ],
      };
    },
  };

  beforeAll(async () => {
    app = buildServer({ recommendationUseCase: mockUseCase });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should accept valid userId and limit and return 200 with RecommendationResponse schema', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/recommendations?userId=u-12345&limit=10',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    expect(body).toHaveProperty('requestId');
    expect(body.userId).toBe('u-12345');
    expect(body).toHaveProperty('timestamp');
    expect(body.degradedMode).toBe(false);
    expect(typeof body.executionDurationMs).toBe('number');
    expect(Array.isArray(body.recommendations)).toBe(true);

    const firstItem = body.recommendations[0];
    expect(firstItem).toMatchObject({
      itemId: 'SKU-1001',
      rank: 1,
      provenance: 'hybrid',
      title: 'Wireless Headphones',
      priceCents: 9999,
    });
    expect(['batch', 'realtime', 'hybrid', 'fallback']).toContain(firstItem.provenance);
  });

  it('should return 400 Bad Request if userId contains invalid characters (violates regex pattern)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/recommendations?userId=invalid$user*id',
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Bad Request');
    expect(body).toHaveProperty('message');
    expect(body).toHaveProperty('requestId');
  });

  it('should return 400 Bad Request if userId parameter is missing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/recommendations',
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Bad Request');
  });

  it('should return 400 Bad Request if limit exceeds 50', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/recommendations?userId=u-12345&limit=100',
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('Bad Request');
  });

  it('should return 400 Bad Request if limit is less than 1', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/recommendations?userId=u-12345&limit=0',
    });

    expect(res.statusCode).toBe(400);
  });
});

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { BatchCandidate, UserIdSchema } from '../../domain/candidate';
import { env } from '../../config/env';
import { baseLogger } from '../logging/logger';
import { createCircuitBreaker } from '../resilience/circuit-breaker';

export interface IDynamoDbBatchRepository {
  getBatchCandidates(userId: string): Promise<BatchCandidate[]>;
}

export class DynamoDbBatchCandidateRepository implements IDynamoDbBatchRepository {
  private docClient: DynamoDBDocumentClient;
  private tableName: string;
  private breaker: ReturnType<typeof createCircuitBreaker>;

  constructor(customDocClient?: DynamoDBDocumentClient, tableName?: string) {
    this.tableName = tableName || env.DYNAMODB_TABLE_NAME;
    if (customDocClient) {
      this.docClient = customDocClient;
    } else {
      const client = new DynamoDBClient({ region: env.AWS_REGION });
      this.docClient = DynamoDBDocumentClient.from(client);
    }

    this.breaker = createCircuitBreaker(
      async (userId: string) => this.fetchFromDynamo(userId),
      {
        timeout: 20, // 20ms timeout deadline per FR-4.2.2
        errorThresholdPercentage: 20,
        resetTimeout: 10000,
        name: 'dynamodb-batch-repo',
      }
    );
  }

  private async fetchFromDynamo(userId: string): Promise<BatchCandidate[]> {
    const response = await this.docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { userId },
      })
    );

    if (!response.Item || !Array.isArray(response.Item.recommendations)) {
      return [];
    }

    const rawRecs = response.Item.recommendations;
    const candidates: BatchCandidate[] = rawRecs.slice(0, 50).map((r: Record<string, unknown>) => ({
      itemId: String(r.itemId),
      score: typeof r.score === 'number' ? r.score : 0,
      rank: typeof r.rank === 'number' ? r.rank : 1,
      modelId: typeof r.modelId === 'string' ? r.modelId : undefined,
      category: typeof r.category === 'string' ? r.category : undefined,
      priceCents: typeof r.priceCents === 'number' ? r.priceCents : undefined,
      title: typeof r.title === 'string' ? r.title : undefined,
    }));

    return candidates;
  }

  public async getBatchCandidates(userId: string): Promise<BatchCandidate[]> {
    const parseResult = UserIdSchema.safeParse(userId);
    if (!parseResult.success) {
      throw new Error(`Invalid userId format: ${userId}`);
    }

    try {
      const result = await this.breaker.fire(userId);
      return (result as BatchCandidate[]) || [];
    } catch (error) {
      baseLogger.warn(
        { error, userId },
        `DynamoDB batch candidate retrieval failed or timed out. Returning empty list.`
      );
      return [];
    }
  }
}

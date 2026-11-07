import { SageMakerRuntimeClient, InvokeEndpointCommand } from '@aws-sdk/client-sagemaker-runtime';
import { env } from '../../config/env';
import { baseLogger } from '../logging/logger';
import { createCircuitBreaker } from '../resilience/circuit-breaker';

export interface ScoringCandidateInput {
  itemId: string;
  initialScore: number;
  provenance: 'batch' | 'realtime' | 'hybrid';
  category?: string;
  priceCents?: number;
}

export interface SageMakerScoringRequest {
  userId: string;
  sessionContext?: {
    recentItemIds?: string[];
    deviceType?: 'mobile' | 'desktop' | 'tablet';
  };
  candidates: ScoringCandidateInput[];
}

export interface ScoredPrediction {
  itemId: string;
  score: number;
}

export interface SageMakerScoringResponse {
  modelId: string;
  predictions: ScoredPrediction[];
}

export interface ISageMakerScoringClient {
  scoreCandidates(input: SageMakerScoringRequest): Promise<ScoredPrediction[]>;
}

export class SageMakerScoringClient implements ISageMakerScoringClient {
  private client: SageMakerRuntimeClient;
  private endpointName: string;
  private breaker: ReturnType<typeof createCircuitBreaker>;

  constructor(customClient?: SageMakerRuntimeClient, endpointName?: string) {
    this.endpointName = endpointName || env.SAGEMAKER_ENDPOINT_NAME;
    this.client = customClient || new SageMakerRuntimeClient({ region: env.AWS_REGION });

    this.breaker = createCircuitBreaker(
      async (req: SageMakerScoringRequest) => this.invokeEndpoint(req),
      {
        timeout: 35, // 35ms timeout deadline per spec
        errorThresholdPercentage: 20,
        resetTimeout: 10000,
        name: 'sagemaker-scoring-client',
      }
    );
  }

  private async invokeEndpoint(request: SageMakerScoringRequest): Promise<ScoredPrediction[]> {
    const payload = JSON.stringify(request);

    const command = new InvokeEndpointCommand({
      EndpointName: this.endpointName,
      ContentType: 'application/json',
      Accept: 'application/json',
      Body: Buffer.from(payload),
    });

    const response = await this.client.send(command);
    if (!response.Body) {
      return [];
    }

    const rawBody = Buffer.from(response.Body).toString('utf-8');
    const parsed = JSON.parse(rawBody) as SageMakerScoringResponse;

    if (!Array.isArray(parsed.predictions)) {
      return [];
    }

    return parsed.predictions.map((p) => ({
      itemId: String(p.itemId),
      score: typeof p.score === 'number' ? Math.max(0.0, Math.min(1.0, p.score)) : 0.0,
    }));
  }

  public async scoreCandidates(input: SageMakerScoringRequest): Promise<ScoredPrediction[]> {
    if (!input.candidates || input.candidates.length === 0) {
      return [];
    }

    // Limit candidate array to 100 max per contract
    const boundedCandidates = input.candidates.slice(0, 100);
    const sanitizedInput: SageMakerScoringRequest = {
      ...input,
      candidates: boundedCandidates,
    };

    try {
      const result = await this.breaker.fire(sanitizedInput);
      return (result as ScoredPrediction[]) || [];
    } catch (error) {
      baseLogger.warn(
        { error, userId: input.userId },
        `SageMaker scoring client invocation failed or timed out. Downstream fallback will be triggered.`
      );
      throw error;
    }
  }
}

import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { env } from '../../config/env';
import { baseLogger } from '../logging/logger';

export interface ICloudWatchMetricsPublisher {
  publishDegradedMode(): Promise<void>;
  publishSageMakerFallback(): Promise<void>;
  publishMemoryDbFallback(): Promise<void>;
  publishDynamoDbFallback(): Promise<void>;
}

export class CloudWatchMetricsPublisher implements ICloudWatchMetricsPublisher {
  private client: CloudWatchClient;
  private namespace = 'Ecommerce/Recommendations';

  constructor(customClient?: CloudWatchClient) {
    this.client = customClient || new CloudWatchClient({ region: env.AWS_REGION });
  }

  private async putMetric(metricName: string, value = 1): Promise<void> {
    try {
      await this.client.send(
        new PutMetricDataCommand({
          Namespace: this.namespace,
          MetricData: [
            {
              MetricName: metricName,
              Value: value,
              Unit: 'Count',
              Timestamp: new Date(),
            },
          ],
        })
      );
    } catch (err) {
      // Metrics publishing failure should never fail recommendation requests
      baseLogger.warn({ err, metricName }, `Failed to put CloudWatch metric: ${metricName}`);
    }
  }

  public async publishDegradedMode(): Promise<void> {
    await this.putMetric('DegradedModeCount');
  }

  public async publishSageMakerFallback(): Promise<void> {
    await this.putMetric('SageMakerFallbackCount');
  }

  public async publishMemoryDbFallback(): Promise<void> {
    await this.putMetric('MemoryDbFallbackCount');
  }

  public async publishDynamoDbFallback(): Promise<void> {
    await this.putMetric('DynamoDbFallbackCount');
  }
}

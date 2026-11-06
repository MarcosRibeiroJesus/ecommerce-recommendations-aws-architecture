import { FastifyRequest, FastifyReply } from 'fastify';

export type DownstreamStatus = 'CONNECTED' | 'DEGRADED' | 'UNREACHABLE';
export type OverallServiceStatus = 'UP' | 'DEGRADED' | 'DOWN';

export interface HealthResponse {
  status: OverallServiceStatus;
  timestamp: string;
  downstream: {
    dynamoDb: DownstreamStatus;
    memoryDb: DownstreamStatus;
    sageMaker: DownstreamStatus;
  };
}

export interface DownstreamHealthCheckers {
  checkDynamoDb?: () => Promise<DownstreamStatus>;
  checkMemoryDb?: () => Promise<DownstreamStatus>;
  checkSageMaker?: () => Promise<DownstreamStatus>;
}

export class HealthController {
  private checkers: DownstreamHealthCheckers;

  constructor(checkers: DownstreamHealthCheckers = {}) {
    this.checkers = checkers;
  }

  public async getHealth(_req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const [dynamoDb, memoryDb, sageMaker] = await Promise.all([
      this.checkers.checkDynamoDb ? this.checkers.checkDynamoDb().catch(() => 'UNREACHABLE' as const) : Promise.resolve('CONNECTED' as const),
      this.checkers.checkMemoryDb ? this.checkers.checkMemoryDb().catch(() => 'UNREACHABLE' as const) : Promise.resolve('CONNECTED' as const),
      this.checkers.checkSageMaker ? this.checkers.checkSageMaker().catch(() => 'UNREACHABLE' as const) : Promise.resolve('CONNECTED' as const),
    ]);

    let overallStatus: OverallServiceStatus = 'UP';
    const statuses = [dynamoDb, memoryDb, sageMaker];

    if (statuses.every((s) => s === 'UNREACHABLE')) {
      overallStatus = 'DOWN';
    } else if (statuses.some((s) => s === 'DEGRADED' || s === 'UNREACHABLE')) {
      overallStatus = 'DEGRADED';
    } else {
      overallStatus = 'UP';
    }

    const payload: HealthResponse = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      downstream: {
        dynamoDb,
        memoryDb,
        sageMaker,
      },
    };

    const statusCode = overallStatus === 'DOWN' ? 503 : 200;
    reply.status(statusCode).send(payload);
  }
}

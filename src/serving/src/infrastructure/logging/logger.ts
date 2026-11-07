import pino, { Logger, LoggerOptions } from 'pino';
import { env } from '../../config/env';

export interface StageMetrics {
  stageName: string;
  durationMs: number;
  itemCountBefore?: number;
  itemCountAfter?: number;
  fallbackTriggered?: boolean;
}

const pinoOptions: LoggerOptions = {
  level: env.LOG_LEVEL,
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
};

export const baseLogger: Logger = pino(pinoOptions);

export interface RequestContext {
  requestId: string;
  userId?: string;
}

export function createChildLogger(context: RequestContext): Logger {
  return baseLogger.child({
    requestId: context.requestId,
    userId: context.userId,
  });
}

export class StageTimer {
  private startTime: bigint;
  private logger: Logger;
  private stageName: string;

  constructor(logger: Logger, stageName: string) {
    this.logger = logger;
    this.stageName = stageName;
    this.startTime = process.hrtime.bigint();
  }

  public end(extraMetadata: {
    itemCountBefore?: number;
    itemCountAfter?: number;
    fallbackTriggered?: boolean;
    [key: string]: unknown;
  } = {}): number {
    const endTime = process.hrtime.bigint();
    const durationMs = Number(endTime - this.startTime) / 1_000_000;
    const roundedDuration = Math.round(durationMs * 100) / 100;

    this.logger.info({
      stage: this.stageName,
      durationMs: roundedDuration,
      ...extraMetadata,
    }, `Stage completed: ${this.stageName} in ${roundedDuration}ms`);

    return roundedDuration;
  }
}

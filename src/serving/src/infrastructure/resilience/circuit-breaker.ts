import CircuitBreaker from 'opossum';
import { baseLogger } from '../logging/logger';

export interface CircuitBreakerOptions {
  timeout?: number;
  errorThresholdPercentage?: number;
  resetTimeout?: number;
  volumeThreshold?: number;
  name?: string;
}

const defaultOptions: CircuitBreaker.Options = {
  timeout: 35, // default 35ms
  errorThresholdPercentage: 20, // 20% failure threshold per NFR-4.2.2
  resetTimeout: 10000, // 10s cooldown
  volumeThreshold: 5, // minimum requests before tripping
};

export function createCircuitBreaker<TI extends unknown[], TR>(
  action: (...args: TI) => Promise<TR>,
  options: CircuitBreakerOptions = {}
): CircuitBreaker<TI, TR> {
  const breakerOptions: CircuitBreaker.Options = {
    ...defaultOptions,
    ...options,
    name: options.name || action.name || 'unnamed-breaker',
  };

  const breaker = new CircuitBreaker(action, breakerOptions);

  breaker.on('open', () => {
    baseLogger.warn(
      { breaker: breakerOptions.name },
      `Circuit breaker OPEN: downstream calls will fail fast / fallback`
    );
  });

  breaker.on('halfOpen', () => {
    baseLogger.info(
      { breaker: breakerOptions.name },
      `Circuit breaker HALF-OPEN: testing canary requests`
    );
  });

  breaker.on('close', () => {
    baseLogger.info(
      { breaker: breakerOptions.name },
      `Circuit breaker CLOSED: normal operation restored`
    );
  });

  breaker.on('fallback', (result) => {
    baseLogger.warn(
      { breaker: breakerOptions.name, result },
      `Circuit breaker FALLBACK executed`
    );
  });

  return breaker;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 2,
  backoffMs = 10
): Promise<T> {
  let attempt = 0;
  while (attempt <= retries) {
    try {
      return await fn();
    } catch (error) {
      attempt++;
      if (attempt > retries) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, backoffMs * attempt));
    }
  }
  throw new Error('Retry limit reached');
}

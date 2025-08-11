import { JitterMode, RateLimiter } from './utils/rateLimiter';
import { RetryIf, RetryOnResult } from './retry';

export type NextDelayInput<T = unknown> = {
  attempt: number;
  lastError?: unknown;
  lastResult?: T;
  suggestedDelayMs: number;
};

export type NextDelayOverride<T = unknown> = (ctx: NextDelayInput<T>) => number | Promise<number>;

export interface RateLimiterLike {
  acquire(): Promise<void>;
}

export interface RateLimitOptions {
  tokensPerInterval: number;
  interval: number; // in ms
  /**
   * Controls how jitter is applied to delays:
   * - 'none': No jitter, use exact delays
   * - 'full': Random delay between 0 and calculated delay
   * - 'equal': Random delay between 50% and 100% of calculated delay
   * @default 'none'
   */
  jitterMode?: JitterMode;
}

export interface RetryOptions<T> {
  /** Max number of retries. 0 means no retry after the first attempt. */
  retries?: number;

  /** Per-attempt timeout. Aborts the current try, the runner may still retry. */
  timeout?: number;

  /** Abort the whole retry loop from the outside. */
  signal?: AbortSignal;

  /** Custom wait before the next attempt. Receives the attempt number. */
  delayFn?: (attempt: number) => Promise<void>;

  /** Called right before scheduling the next retry with the error and attempt. */
  onRetry?: (error: Error, attempt: number) => void;

  /** Shared rate limiter to pace attempts across calls. */
  rateLimiter?: RateLimiter;

  /** Build-time options for an internal rate limiter (when no limiter is passed). */
  rateLimit?: RateLimitOptions;

  /** Decide if an error should trigger a retry. Return true to retry. */
  retryIf?: RetryIf;

  /** Decide if a result should trigger another attempt. Return true to retry. */
  retryOnResult?: RetryOnResult<T>;

  /** Hard cap for total elapsed time across all attempts. Exceeding stops with failure. */
  maxElapsedTime?: number;

  /** Hook to override the computed delay for the next attempt. */
  nextDelayOverride?: NextDelayOverride<T>;

  /** Called once when we give up for good. Gets the last error and attempt count. */
  onGiveUp?: (lastError: unknown, attempts: number) => void | Promise<void>;
}

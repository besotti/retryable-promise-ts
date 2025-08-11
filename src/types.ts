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
  acquire: () => Promise<void>;
}

export interface RateLimitOptions {
  tokensPerInterval: number;
  interval: number; // ms
  /**
   * Jitter strategy:
   * - 'none': exact delay
   * - 'full': 0..delay
   * - 'equal': 50%..100% of delay
   * @default 'none'
   */
  jitterMode?: JitterMode;
}

export interface RetryOptions<T> {
  /** Max retries. 0 = no retry after first attempt. */
  retries?: number;

  /** Per-attempt timeout. Cancels the current try. */
  timeout?: number;

  /** Abort the whole loop. */
  signal?: AbortSignal;

  /** Custom wait before the next attempt. Gets the attempt number. */
  delayFn?: (attempt: number) => Promise<void>;

  /** Called before we schedule the next try. */
  onRetry?: (error: Error, attempt: number) => void;

  /** Shared limiter to pace attempts across calls. */
  rateLimiter?: RateLimiter;

  /** Build-time options when no limiter instance is passed. */
  rateLimit?: RateLimitOptions;

  /** Return true to retry on this error. */
  retryIf?: RetryIf;

  /** Return true to retry based on the result. */
  retryOnResult?: RetryOnResult<T>;

  /** Hard cap for total elapsed ms across all attempts. */
  maxElapsedTime?: number;

  /** Hook to override the next delay. */
  nextDelayOverride?: NextDelayOverride<T>;

  /** Called once when we give up for good. */
  onGiveUp?: (lastError: unknown, attempts: number) => void | Promise<void>;
}

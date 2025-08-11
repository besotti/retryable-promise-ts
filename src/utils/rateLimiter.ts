import { RateLimiterLike, RateLimitOptions } from '../types';

/**
 * Jitter mode for rate limiting delays
 */
export type JitterMode = 'none' | 'full' | 'equal';

/**
 * A token bucket rate limiter that controls the rate of operations.
 * Supports configurable jitter modes to help prevent thundering herd problems.
 *
 * @example
 * ```
 * // Create a rate limiter with 5 tokens per second
 * const limiter = new RateLimiter({
 *   tokensPerInterval: 5,
 *   interval: 1000
 * });
 *
 * // Create a rate limiter with jitter
 * const jitteredLimiter = new RateLimiter({
 *   tokensPerInterval: 5,
 *   interval: 1000,
 *   jitterMode: 'equal' // Adds randomness to delays
 * });
 *
 * // Use the rate limiter before performing an operation
 * await limiter.acquire();
 * // Now perform the operation
 * ```
 */
export class RateLimiter implements RateLimiterLike {
  private tokens: number;
  private lastRefill: number;
  private options: RateLimitOptions;

  /**
   * Creates a new rate limiter instance.
   *
   * @param options - Configuration for the rate limiter
   */
  constructor(options: RateLimitOptions) {
    this.tokens = options.tokensPerInterval;
    this.lastRefill = Date.now();
    this.options = {
      ...options,
      jitterMode: options.jitterMode || 'none',
    };
  }

  /**
   * Acquires a token from the rate limiter.
   * If no tokens are available, it will wait until a token becomes available.
   *
   * @returns A promise that resolves when a token is acquired
   */
  async acquire(): Promise<void> {
    this.refill();
    if (this.tokens <= 0) {
      const delay = this.calculateDelay();
      await new Promise(resolve => setTimeout(resolve, delay));
      this.refill();
    }
    this.tokens--;
  }

  /**
   * Refills the token bucket based on the time passed since the last refill.
   */
  private refill(): void {
    const now = Date.now();
    const timePassed = now - this.lastRefill;
    const intervalsPassed = Math.floor(timePassed / this.options.interval);

    if (intervalsPassed > 0) {
      const newTokens = intervalsPassed * this.options.tokensPerInterval;
      this.tokens = Math.min(this.options.tokensPerInterval, this.tokens + newTokens);
      this.lastRefill = now;
    }
  }

  /**
   * Calculates the delay needed until the next token becomes available.
   * Applies jitter according to the configured jitterMode.
   *
   * @returns The delay in milliseconds
   */
  private calculateDelay(): number {
    const baseDelay = this.options.interval - (Date.now() - this.lastRefill);

    switch (this.options.jitterMode) {
      case 'full':
        // Random delay between 0 and baseDelay
        return Math.random() * baseDelay;

      case 'equal':
        // Random delay between 50% and 100% of baseDelay
        return baseDelay * (0.5 + Math.random() * 0.5);

      case 'none':
      default:
        // No jitter, use exact delay
        return baseDelay;
    }
  }
}

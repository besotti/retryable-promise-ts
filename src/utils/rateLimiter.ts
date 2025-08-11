import { RateLimiterLike, RateLimitOptions } from '../types';

export type JitterMode = 'none' | 'full' | 'equal';

export class RateLimiter implements RateLimiterLike {
  private tokens: number;
  private lastRefill: number;
  private options: RateLimitOptions;

  constructor(options: RateLimitOptions) {
    this.tokens = options.tokensPerInterval;
    this.lastRefill = Date.now();
    this.options = {
      ...options,
      jitterMode: options.jitterMode || 'none',
    };
  }

  /**
   * Acquire a token, waiting if needed.
   */
  acquire = async (): Promise<void> => {
    this.refill();
    if (this.tokens <= 0) {
      await new Promise(res => setTimeout(res, this.calculateDelay()));
      this.refill();
    }
    this.tokens--;
  };

  /**
   * Add tokens if enough time has passed.
   */
  private refill = (): void => {
    const now = Date.now();
    const timePassed = now - this.lastRefill;
    const intervals = Math.floor(timePassed / this.options.interval);

    if (intervals > 0) {
      const newTokens = intervals * this.options.tokensPerInterval;
      this.tokens = Math.min(this.options.tokensPerInterval, this.tokens + newTokens);
      this.lastRefill = now;
    }
  };

  /**
   * Figure out how long to wait until a token is free, with optional jitter.
   */
  private calculateDelay = (): number => {
    const baseDelay = this.options.interval - (Date.now() - this.lastRefill);

    switch (this.options.jitterMode) {
      case 'full':
        return Math.random() * baseDelay;
      case 'equal':
        return baseDelay * (0.5 + Math.random() * 0.5);
      case 'none':
      default:
        return baseDelay;
    }
  };
}

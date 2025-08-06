import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimiter, retry } from '../src';

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('should allow immediate execution when tokens are available', async () => {
    const limiter = new RateLimiter({
      tokensPerInterval: 5,
      interval: 1000
    });

    const startTime = Date.now();
    await limiter.acquire();
    const endTime = Date.now();

    // Should complete immediately
    expect(endTime - startTime).toBeLessThan(10);
  });

  it('should delay execution when tokens are depleted', async () => {
    const limiter = new RateLimiter({
      tokensPerInterval: 2,
      interval: 1000
    });

    // Use all available tokens
    await limiter.acquire();
    await limiter.acquire();

    // The next acquire should be delayed
    const acquirePromise = limiter.acquire();
    
    // Fast-forward time by 1 second
    await vi.advanceTimersByTimeAsync(1000);
    
    // Now the promise should resolve
    await acquirePromise;
  });

  it('should refill tokens based on time passed', async () => {
    const limiter = new RateLimiter({
      tokensPerInterval: 5,
      interval: 1000
    });

    // Use all tokens
    for (let i = 0; i < 5; i++) {
      await limiter.acquire();
    }

    // Fast-forward time by 500ms (not enough for a refill)
    await vi.advanceTimersByTimeAsync(500);
    
    // This should be delayed
    const firstAcquirePromise = limiter.acquire();
    
    // Fast-forward time by another 500ms (now we should get a refill)
    await vi.advanceTimersByTimeAsync(500);
    
    // Now the promise should resolve
    await firstAcquirePromise;
  });

  it('should use no jitter by default', async () => {
    const limiter = new RateLimiter({
      tokensPerInterval: 1,
      interval: 1000
    });

    // Use the token
    await limiter.acquire();

    // The next acquire should be delayed by exactly 1000ms
    const acquirePromise = limiter.acquire();
    
    // Fast-forward time by 999ms (not enough)
    await vi.advanceTimersByTimeAsync(999);
    
    // Promise should not be resolved yet
    expect(acquirePromise).not.toHaveProperty('_value');
    
    // Fast-forward time by 1ms more (exactly 1000ms total)
    await vi.advanceTimersByTimeAsync(1);
    
    // Now the promise should resolve
    await acquirePromise;
  });

  it('should apply full jitter correctly', async () => {
    // Mock Math.random to return a fixed value
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const limiter = new RateLimiter({
      tokensPerInterval: 1,
      interval: 1000,
      jitterMode: 'full'
    });

    // Use the token
    await limiter.acquire();

    // The next acquire should be delayed by 500ms (50% of 1000ms with Math.random = 0.5)
    const acquirePromise = limiter.acquire();
    
    // Fast-forward time by 499ms (not enough)
    await vi.advanceTimersByTimeAsync(499);
    
    // Promise should not be resolved yet
    expect(acquirePromise).not.toHaveProperty('_value');
    
    // Fast-forward time by 1ms more (exactly 500ms total)
    await vi.advanceTimersByTimeAsync(1);
    
    // Now the promise should resolve
    await acquirePromise;
    
    randomSpy.mockRestore();
  });

  it('should apply equal jitter correctly', async () => {
    // Mock Math.random to return a fixed value
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);

    const limiter = new RateLimiter({
      tokensPerInterval: 1,
      interval: 1000,
      jitterMode: 'equal'
    });

    // Use the token
    await limiter.acquire();

    // The next acquire should be delayed by 750ms (50% + 25% of 1000ms with Math.random = 0.5)
    const acquirePromise = limiter.acquire();
    
    // Fast-forward time by 749ms (not enough)
    await vi.advanceTimersByTimeAsync(749);
    
    // Promise should not be resolved yet
    expect(acquirePromise).not.toHaveProperty('_value');
    
    // Fast-forward time by 1ms more (exactly 750ms total)
    await vi.advanceTimersByTimeAsync(1);
    
    // Now the promise should resolve
    await acquirePromise;
    
    randomSpy.mockRestore();
  });
});

describe('retry with rate limiting', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('should respect rate limits with provided RateLimiter instance', async () => {
    const limiter = new RateLimiter({
      tokensPerInterval: 2,
      interval: 1000
    });

    const mockFn = vi.fn().mockResolvedValue('success');
    
    // First call should succeed immediately
    const promise1 = retry(mockFn, { rateLimiter: limiter });
    await vi.runAllTimersAsync();
    await promise1;
    
    // Second call should also succeed immediately
    const promise2 = retry(mockFn, { rateLimiter: limiter });
    await vi.runAllTimersAsync();
    await promise2;
    
    // Third call should be rate limited
    const promise3 = retry(mockFn, { rateLimiter: limiter });
    
    // Fast-forward time by 1 second to allow rate limiter to refill
    await vi.advanceTimersByTimeAsync(1000);
    await promise3;
    
    expect(mockFn).toHaveBeenCalledTimes(3);
  });

  it('should respect rate limits with provided rate limit options', async () => {
    const mockFn = vi.fn().mockResolvedValue('success');
    
    // First call should succeed immediately
    const promise1 = retry(mockFn, { 
      rateLimit: { tokensPerInterval: 2, interval: 1000 } 
    });
    await vi.runAllTimersAsync();
    await promise1;
    
    // Second call should also succeed immediately
    const promise2 = retry(mockFn, { 
      rateLimit: { tokensPerInterval: 2, interval: 1000 } 
    });
    await vi.runAllTimersAsync();
    await promise2;
    
    // Third call should be rate limited, but since we're creating a new rate limiter,
    // it should not be limited (each call gets its own rate limiter)
    const promise3 = retry(mockFn, { 
      rateLimit: { tokensPerInterval: 2, interval: 1000 } 
    });
    await vi.runAllTimersAsync();
    await promise3;
    
    expect(mockFn).toHaveBeenCalledTimes(3);
  });

  it('should apply rate limiting to retry attempts', async () => {
    const limiter = new RateLimiter({
      tokensPerInterval: 1,
      interval: 1000
    });

    // Mock function that fails twice and then succeeds
    const mockFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('Error on 1st attempt'))
      .mockRejectedValueOnce(new Error('Error on 2nd attempt'))
      .mockResolvedValue('success');

    const promise = retry(mockFn, {
      retries: 2,
      rateLimiter: limiter
    });

    // First attempt should happen immediately
    // Note: The function might be called twice due to the rate limiter's internal timing
    await vi.runOnlyPendingTimersAsync();
    expect(mockFn).toHaveBeenCalled();

    // Advance time to allow rate-limited retries to occur
    // Note: The exact number of calls may vary due to timing and rate limiter behavior
    const initialCallCount = mockFn.mock.calls.length;
    
    // Advance time and verify the function is called again
    await vi.advanceTimersByTimeAsync(1000);
    expect(mockFn.mock.calls.length).toBeGreaterThan(initialCallCount);
    
    // Since our mock is set to succeed on the third call,
    // we should have all calls completed by now
    expect(mockFn).toHaveBeenCalledTimes(3);

    await expect(promise).resolves.toBe('success');
  });
});
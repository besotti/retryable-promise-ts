import { describe, it, expect, vi, afterEach } from 'vitest';
import { RateLimiter, retry } from '../src';

const withFakeTimers = (fn: () => Promise<void> | void) => async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(0));
  try {
    await fn();
  } finally {
    vi.useRealTimers();
  }
};

const flush = async () => {
  // a single tick is most of the time not enough to flush all pending promises
  await Promise.resolve();
  await Promise.resolve();
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('retry + RateLimiter (integration)', () => {
  it(
    'shares limiter across concurrent calls and waits exact remaining time (no jitter)',
    withFakeTimers(async () => {
      const limiter = new RateLimiter({ tokensPerInterval: 2, interval: 1000, jitterMode: 'none' });
      const fn = vi.fn(() => Promise.resolve('ok'));

      const p1 = retry(fn, { retries: 0, rateLimiter: limiter });
      const p2 = retry(fn, { retries: 0, rateLimiter: limiter });
      const p3 = retry(fn, { retries: 0, rateLimiter: limiter });

      await flush(); // the first two should be done now
      expect(fn).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(999);
      await flush();
      expect(fn).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(1);
      await flush();
      expect(fn).toHaveBeenCalledTimes(3);

      await Promise.all([p1, p2, p3]);
    })
  );

  // NEW: no jitterMode provided -> defaults to 'none' (covers: jitterMode: options.jitterMode || 'none')
  it(
    'defaults to jitterMode="none" when omitted (exact base delay)',
    withFakeTimers(async () => {
      const limiter = new RateLimiter({ tokensPerInterval: 1, interval: 1000 }); // no jitterMode
      const fn = vi.fn(() => Promise.resolve('ok'));

      const a = retry(fn, { retries: 0, rateLimiter: limiter }); // consumes the only token
      await flush();
      expect(fn).toHaveBeenCalledTimes(1);

      const b = retry(fn, { retries: 0, rateLimiter: limiter }); // must wait full interval
      await flush();
      expect(fn).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(999);
      await flush();
      expect(fn).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1);
      await flush();
      expect(fn).toHaveBeenCalledTimes(2);

      await Promise.all([a, b]);
    })
  );

  it(
    'refills over time and caps at tokensPerInterval',
    withFakeTimers(async () => {
      const limiter = new RateLimiter({ tokensPerInterval: 3, interval: 200, jitterMode: 'none' });
      const fn = vi.fn(() => Promise.resolve('ok'));

      const p1 = retry(fn, { retries: 0, rateLimiter: limiter });
      const p2 = retry(fn, { retries: 0, rateLimiter: limiter });
      const p3 = retry(fn, { retries: 0, rateLimiter: limiter });
      const p4 = retry(fn, { retries: 0, rateLimiter: limiter });

      await flush();
      expect(fn).toHaveBeenCalledTimes(3); // 3 now, 1 waits

      await vi.advanceTimersByTimeAsync(200);
      await flush();
      expect(fn).toHaveBeenCalledTimes(4);
      await Promise.all([p1, p2, p3, p4]);

      // many intervals -> cap stays at 3
      await vi.advanceTimersByTimeAsync(200 * 10);
      await flush();

      const q1 = retry(fn, { retries: 0, rateLimiter: limiter });
      const q2 = retry(fn, { retries: 0, rateLimiter: limiter });
      const q3 = retry(fn, { retries: 0, rateLimiter: limiter });
      await flush();
      expect(fn).toHaveBeenCalledTimes(7); // +3

      const q4 = retry(fn, { retries: 0, rateLimiter: limiter });
      await flush();
      expect(fn).toHaveBeenCalledTimes(7); // 4th waits

      await vi.advanceTimersByTimeAsync(200);
      await flush();
      expect(fn).toHaveBeenCalledTimes(8);

      await Promise.all([q1, q2, q3, q4]);
    })
  );

  it(
    'applies full jitter (0..baseDelay) via retry',
    withFakeTimers(async () => {
      const saveRandom = Math.random;
      Math.random = () => 0.3; // 30% of baseDelay
      try {
        const limiter = new RateLimiter({
          tokensPerInterval: 1,
          interval: 1000,
          jitterMode: 'full',
        });
        const fn = vi.fn(() => Promise.resolve('ok'));

        const a = retry(fn, { retries: 0, rateLimiter: limiter }); // uses token
        await flush();
        expect(fn).toHaveBeenCalledTimes(1);

        const b = retry(fn, { retries: 0, rateLimiter: limiter }); // waits ~300ms
        await flush();
        expect(fn).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(299);
        await flush();
        expect(fn).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(1);
        await flush();
        expect(fn).toHaveBeenCalledTimes(2);

        await Promise.all([a, b]);
      } finally {
        Math.random = saveRandom;
      }
    })
  );

  it(
    'applies equal jitter lower and upper bounds via retry',
    withFakeTimers(async () => {
      const fn = vi.fn(() => Promise.resolve('ok'));

      // lower bound ~50%
      {
        const saveRandom = Math.random;
        Math.random = () => 0.0;
        const limiter = new RateLimiter({
          tokensPerInterval: 1,
          interval: 1000,
          jitterMode: 'equal',
        });

        const p1 = retry(fn, { retries: 0, rateLimiter: limiter });
        await flush();
        expect(fn).toHaveBeenCalledTimes(1);

        const p2 = retry(fn, { retries: 0, rateLimiter: limiter });
        await flush();
        expect(fn).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(499);
        await flush();
        expect(fn).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(1);
        await flush();
        expect(fn).toHaveBeenCalledTimes(2);

        await Promise.all([p1, p2]);
        Math.random = saveRandom;
      }

      fn.mockClear();

      // upper bound ~100%
      {
        const saveRandom = Math.random;
        Math.random = () => 1.0;
        const limiter = new RateLimiter({
          tokensPerInterval: 1,
          interval: 1000,
          jitterMode: 'equal',
        });

        const p1 = retry(fn, { retries: 0, rateLimiter: limiter });
        await flush();
        expect(fn).toHaveBeenCalledTimes(1);

        const p2 = retry(fn, { retries: 0, rateLimiter: limiter });
        await flush();
        expect(fn).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(999);
        await flush();
        expect(fn).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(1);
        await flush();
        expect(fn).toHaveBeenCalledTimes(2);

        await Promise.all([p1, p2]);
        Math.random = saveRandom;
      }
    })
  );

  it(
    'throttles retry attempts (not only separate calls)',
    withFakeTimers(async () => {
      const limiter = new RateLimiter({ tokensPerInterval: 1, interval: 1000, jitterMode: 'none' });

      let calls = 0;
      const fn = vi.fn(async () => {
        calls++;
        if (calls === 1) throw new Error('boom');
        return 'ok';
      });

      const p = retry(fn, { retries: 1, rateLimiter: limiter });

      await flush();
      expect(fn).toHaveBeenCalledTimes(1); // 1st try

      await vi.advanceTimersByTimeAsync(999);
      await flush();
      expect(fn).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1);
      await flush();
      await p;
      expect(fn).toHaveBeenCalledTimes(2);
    })
  );
});

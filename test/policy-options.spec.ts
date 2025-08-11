import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { retry } from '../src';
import * as delayMod from '../src/core/delayMs';

type Fn<T> = (signal?: AbortSignal) => Promise<T>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
vi.mock('../src/utils/rateLimiter', () => {
  class RateLimiter {
    calls: number = 0;
    async acquire() {
      this.calls++;
    }
  }
  return { RateLimiter, RateLimitOptions: {} };
});

// Simple helper: creates a function to fail each n-1x loop
const makeFlaky = <T>(failTimes: number, errFactory: () => unknown, result: T) => {
  let left = failTimes;
  return async () => {
    if (left-- > 0) throw errFactory();
    return result;
  };
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('retry core happy path', () => {
  it('resolves immediately when fn succeeds', async () => {
    const out = await retry(async () => 42);
    expect(out).toBe(42);
  });

  it('retries up to retries and then resolves', async () => {
    const onRetry = vi.fn();
    const fn = makeFlaky(2, () => new Error('boom'), 'ok');

    const p = retry(fn, { retries: 3, onRetry });
    await expect(p).resolves.toBe('ok');
    expect(onRetry).toHaveBeenCalledTimes(2);
  });
});

describe('retryIf (error filter)', () => {
  it('does not retry when retryIf returns false', async () => {
    const err = new Error('no-retry');
    const fn = makeFlaky(1, () => err, 'ok');

    await expect(
      retry(fn, {
        retries: 3,
        retryIf: async e => {
          expect(e).toBe(err);
          return false;
        },
      })
    ).rejects.toBe(err);
  });

  it('retries only server errors (>=500) or 429', async () => {
    let code = 500;
    const fn = async () => {
      const e = new Error('http') as Error & { status: number };
      e.status = code;
      code -= 1; // 500 -> 499 -> succeed
      if (e.status >= 500) throw e;
      return 'ok';
    };

    const onRetry = vi.fn();
    const out = await retry(fn, {
      retries: 3,
      onRetry,
      retryIf: (e: Error & { status: number }) => {
        const s = e?.status;
        return s >= 500 || s === 429;
      },
    });

    expect(out).toBe('ok');
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('retryOnResult (result filter)', () => {
  it('retries on bad result and then returns good result', async () => {
    let stage = 0;
    const fn = async () => {
      stage++;
      return stage < 3 ? { ok: false } : { ok: true, data: 123 };
    };

    const onRetry = vi.fn();
    const out = await retry(fn, {
      retries: 5,
      onRetry,
      retryOnResult: res => res.ok === false,
    });

    expect(out).toEqual({ ok: true, data: 123 });
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('returns last (bad) result if retries exhausted', async () => {
    const fn = async () => ({ ok: false, v: Math.random() });

    const out = await retry(fn, {
      retries: 1,
      retryOnResult: () => true,
    });

    expect(out.ok).toBe(false);
  });
});

describe('maxElapsedTime', () => {
  it('throws if budget exceeded before attempt', async () => {
    await expect(retry(async () => 42, { maxElapsedTime: 0 })).rejects.toMatchObject({
      name: 'RetryMaxElapsedTimeExceeded',
    });
  });

  it('returns current result when wait would exceed budget (result path)', async () => {
    let step = 0;
    const fn = async () => ({ ok: step++ >= 1 });

    const p = retry(fn, {
      retries: 5,
      maxElapsedTime: 500,
      delayFn: async () => {
        await new Promise(r => setTimeout(r, 600)); // würde Budget sprengen
      },
      retryOnResult: res => res.ok === false,
    });

    await vi.runOnlyPendingTimersAsync();
    await Promise.resolve();

    const result = await p;
    expect(result.ok).toBe(false);
  });
});

describe('retry – budget guard via nextDelayOverride', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns early when maxElapsedTime is already exceeded before any waiting', async () => {
    const delaySpy = vi.spyOn(delayMod, 'delayMs').mockResolvedValue();

    const err = new Error('timeout');

    vi.useFakeTimers();
    vi.setSystemTime(new Date(0));

    let firstCall = true;
    const fn: Fn<string> = async () => {
      if (firstCall) {
        firstCall = false;
        vi.setSystemTime(new Date(1000)); // elapsed = 1000ms
      }
      throw err;
    };

    const p = retry(fn, {
      retries: 1,
      maxElapsedTime: 500,
      nextDelayOverride: () => 100,
    });

    await expect(p).rejects.toBe(err);

    // IMPORTANT: No additional waiting occurs because the first guard in runDelayWithOverride is triggered.
    expect(delaySpy).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('stops retry when extra wait would exceed maxElapsedTime (guard path hit)', async () => {
    // We spy on delayMs to assert there was no extra sleeping when guard triggers.
    const delaySpy = vi.spyOn(delayMod, 'delayMs').mockResolvedValue();

    const err = new Error('boom');
    const fn: Fn<string> = async () => {
      throw err; // always fails -> would attempt to schedule another try
    };

    const start = Date.now();
    // Ensure we don't call delayFn (so waited = 0). Let override suggest 1000ms.
    // With maxElapsedTime=900 and elapsed≈0, guard should trigger (false from runDelayWithOverride).
    const p = retry(fn, {
      retries: 1,
      maxElapsedTime: 900,
      nextDelayOverride: () => 1000,
    });

    await expect(p).rejects.toBe(err);

    // No extra sleep since guard prevented it
    expect(delaySpy).not.toHaveBeenCalled();

    // Time didn't need to advance because we never actually slept
    expect(Date.now() - start).toBe(0);
  });

  it('performs extra wait when it fits the remaining budget and retries (second attempt succeeds)', async () => {
    const delaySpy = vi.spyOn(delayMod, 'delayMs').mockImplementation(async ms => {
      // Simulate the passage of time for the extra wait
      await vi.advanceTimersByTimeAsync(ms);
    });

    // First attempt fails, second succeeds -> we can detect that retry actually happened.
    const fn = makeFlaky(1, () => new Error('first fail'), 'ok');

    // Advance "wall clock" a bit so elapsed is not zero; still enough budget left.
    vi.setSystemTime(new Date(100)); // elapsed=100ms at first call

    const p = retry(fn, {
      retries: 1,
      maxElapsedTime: 500, // total budget
      nextDelayOverride: () => 200, // extra wait fits (100 + 200 < 500)
    });

    // Since we mocked delayMs to advance timers, we should await the result directly.
    await expect(p).resolves.toBe('ok');

    // We did perform the extra wait
    expect(delaySpy).toHaveBeenCalledTimes(1);
    expect(delaySpy).toHaveBeenCalledWith(200);

    // And simulated time advanced accordingly
    expect(Date.now()).toBe(300); // 100 initial + 200 extra
  });
});

describe('Abort & timeout handling', () => {
  it('rejects immediately if external signal already aborted', async () => {
    const c = new AbortController();
    c.abort();
    await expect(retry(async () => 1, { signal: c.signal })).rejects.toThrow('Operation aborted');
  });

  it('rejects on abort during execution', async () => {
    const c = new AbortController();
    const fn = async (signal?: AbortSignal) => {
      // simulate long task that respects abort
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, 10_000);
        signal?.addEventListener('abort', () => {
          clearTimeout(t);
          reject(new Error('aborted inside fn'));
        });
      });

      return 1;
    };

    const p = retry(fn, { signal: c.signal });
    c.abort();
    await expect(p).rejects.toThrow('Operation aborted');
  });
});

describe('onGiveUp & retries limit', () => {
  it('calls onGiveUp after retries exhausted', async () => {
    const onGiveUp = vi.fn();
    const fn = makeFlaky(5, () => new Error('fail-x'), 'ok');

    await expect(retry(fn, { retries: 2, onGiveUp })).rejects.toThrow('fail-x');

    expect(onGiveUp).toHaveBeenCalledTimes(1);
    const [lastErr, attempts] = onGiveUp.mock.calls[0];
    expect((lastErr as Error).message).toBe('fail-x');
    expect(attempts).toBeGreaterThan(0);
  });
});

describe('rateLimiter and rateLimit integration', () => {
  it('constructs a RateLimiter from rateLimit options', async () => {
    const calls: number[] = [];
    // Patch den ctor, um den Pfad zu verifizieren
    const mod = await import('../src/utils/rateLimiter');
    const Original = (mod as unknown as { RateLimiter: typeof Original }).RateLimiter;
    (mod as unknown as { RateLimiter: typeof Original }).RateLimiter = class extends Original {
      constructor(opts: unknown) {
        super(opts);
        calls.push(1);
      }
    };

    const out = await retry(async () => 9, {
      rateLimit: {
        tokensPerInterval: 1,
        interval: 1000,
        jitterMode: 'none',
      },
    });
    expect(out).toBe(9);
    expect(calls.length).toBe(1);

    (mod as unknown as { RateLimiter: typeof Original }).RateLimiter = Original; // restore
  });
});

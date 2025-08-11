// tests/httpRetrySignals.integration.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock must come before the import of retry so it uses the mocked version
vi.mock('../src/core/delayWithOverride', () => {
  return {
    runDelayWithOverride: vi.fn(async () => true), // no real waiting
  };
});

// Now we can import after the mock is set up
import { retry } from '../src';
import { runDelayWithOverride } from '../src/core/delayWithOverride';

// Helper: function that fails the first time, succeeds the second
function flakyWithOnceError<T>(err: unknown, ok: T) {
  let called = 0;
  return async () => {
    called++;
    if (called === 1) throw err;
    return ok;
  };
}

// Simple Headers-like object for positive path testing
class HeadersLikeOK {
  private map = new Map<string, string>();
  constructor(init?: Record<string, string | number>) {
    if (init) {
      for (const [k, v] of Object.entries(init)) {
        this.map.set(k, String(v));
      }
    }
  }
  get(key: string) {
    return this.map.get(key) ?? null;
  }
}

// Headers-like object that throws when accessed (to hit the error branch in getHeader)
class HeadersLikeThrow {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  get(_key: string) {
    throw new Error('boom');
  }
}

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
let nowSpy: vi.SpyInstance<number, []>;
const FIXED_NOW = new Date('2025-01-01T00:00:00.000Z').getTime();

beforeEach(() => {
  vi.clearAllMocks();
  nowSpy = vi.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
});

afterEach(() => {
  nowSpy.mockRestore();
});

// Helper: grab the nextDelayOverride passed into runDelayWithOverride
// and execute it with a controlled suggestedDelayMs value
async function getComputedOverrideMs(suggestedDelayMs = 50): Promise<number | undefined> {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-expect-error
  const call = vi.mocked(runDelayWithOverride).mock.calls.at(-1)?.[0] as
    | {
        nextDelayOverride?: (ctx: any) => Promise<number> | number;
        attempt: number;
        startTime: number;
        maxElapsedTime?: number;
        lastError?: unknown;
        lastResult?: unknown;
      }
    | undefined;

  expect(call).toBeTruthy();
  expect(call?.nextDelayOverride).toBeTypeOf('function');

  const val = await call!.nextDelayOverride!({
    attempt: call!.attempt,
    startTime: call!.startTime,
    maxElapsedTime: call!.maxElapsedTime,
    lastError: call!.lastError,
    lastResult: call!.lastResult,
    suggestedDelayMs,
  });

  return val;
}

describe('integration: HTTP retry hints through retry()', () => {
  it('Retry-After in seconds (Headers-like) sets the floor', async () => {
    const err = { response: { headers: new HeadersLikeOK({ 'Retry-After': '5' }) } };
    await expect(retry(flakyWithOnceError(err, 'ok'), { retries: 1 })).resolves.toBe('ok');
    expect(runDelayWithOverride).toHaveBeenCalledTimes(1);
    const computed = await getComputedOverrideMs(50);
    expect(computed).toBe(5000);
  });

  it('Retry-After as future HTTP date sets the floor', async () => {
    const future = new Date(FIXED_NOW + 10_000).toUTCString();
    const err = { response: { headers: new HeadersLikeOK({ 'Retry-After': future }) } };
    await expect(retry(flakyWithOnceError(err, 'ok'), { retries: 1 })).resolves.toBe('ok');
    const computed = await getComputedOverrideMs(100);
    expect(computed).toBe(10_000);
  });

  it('Retry-After as past HTTP date does not set a floor', async () => {
    const past = new Date(FIXED_NOW - 10_000).toUTCString();
    const err = { response: { headers: new HeadersLikeOK({ 'Retry-After': past }) } };
    await expect(retry(flakyWithOnceError(err, 'ok'), { retries: 1 })).resolves.toBe('ok');
    const computed = await getComputedOverrideMs(123);
    expect(computed).toBe(123);
  });

  it.each([
    [
      'x-ratelimit-reset in seconds',
      { 'x-ratelimit-reset': String(Math.floor((FIXED_NOW + 9000) / 1000)) },
      9000,
    ],
    [
      'x-rate-limit-reset in seconds',
      { 'x-rate-limit-reset': String(Math.floor((FIXED_NOW + 7000) / 1000)) },
      7000,
    ],
    ['rate-limit-reset in ms', { 'rate-limit-reset': String(FIXED_NOW + 8000) }, 8000],
  ])('%s applies floor', async (_title, header, expectedMs) => {
    const err = { response: { headers: header } };
    await expect(retry(flakyWithOnceError(err, 'ok'), { retries: 1 })).resolves.toBe('ok');
    const computed = await getComputedOverrideMs(50);
    expect(computed).toBe(expectedMs);
  });

  it('Status 429 without headers defaults to 1000ms', async () => {
    await expect(retry(flakyWithOnceError({ status: 429 }, 'ok'), { retries: 1 })).resolves.toBe(
      'ok'
    );
    const computed = await getComputedOverrideMs(10);
    expect(computed).toBe(1000);
  });

  it('Status 503 defaults to 1000ms', async () => {
    await expect(retry(flakyWithOnceError({ status: 503 }, 'ok'), { retries: 1 })).resolves.toBe(
      'ok'
    );
    const computed = await getComputedOverrideMs(10);
    expect(computed).toBe(1000);
  });

  it('Nested cause.response headers + status is handled', async () => {
    const future = new Date(FIXED_NOW + 6000).toUTCString();
    const err = {
      cause: { response: { status: 429, headers: new HeadersLikeOK({ 'Retry-After': future }) } },
    };
    await expect(retry(flakyWithOnceError(err, 'ok'), { retries: 1 })).resolves.toBe('ok');
    const computed = await getComputedOverrideMs(1);
    expect(computed).toBe(6000);
  });

  it('Plain header object (case-insensitive) works', async () => {
    const err = { headers: { 'retry-after': '3' } };
    await expect(retry(flakyWithOnceError(err, 'ok'), { retries: 1 })).resolves.toBe('ok');
    const computed = await getComputedOverrideMs(5);
    expect(computed).toBe(3000);
  });

  it('HeadersLike that throws falls back to status', async () => {
    const err = { response: { headers: new HeadersLikeThrow() }, status: 429 };
    await expect(retry(flakyWithOnceError(err, 'ok'), { retries: 1 })).resolves.toBe('ok');
    const computed = await getComputedOverrideMs(5);
    expect(computed).toBe(1000);
  });

  it('NaN values in headers fall back to status', async () => {
    const err = {
      response: {
        headers: new HeadersLikeOK({ 'Retry-After': 'not-a-number', 'x-ratelimit-reset': 'NaN' }),
      },
      status: 429,
    };
    await expect(retry(flakyWithOnceError(err, 'ok'), { retries: 1 })).resolves.toBe('ok');
    const computed = await getComputedOverrideMs(77);
    expect(computed).toBe(1000);
  });

  it('covers retryAfterMs when it is a number', async () => {
    const err = { retryAfterMs: 2500 };
    await expect(retry(flakyWithOnceError(err, 'ok'), { retries: 1 })).resolves.toBe('ok');
    const computed = await getComputedOverrideMs(100);
    expect(computed).toBe(2500);
  });

  it('covers toFiniteNumber number branch via numeric header value', async () => {
    const err = {
      response: { headers: new HeadersLikeOK({ 'Retry-After': 7 }) }, // number, not string
    };
    await expect(retry(flakyWithOnceError(err, 'ok'), { retries: 1 })).resolves.toBe('ok');
    const computed = await getComputedOverrideMs(1);
    expect(computed).toBe(7000); // 7 seconds
  });

  it('covers getHeader returning String(val) when val is number', async () => {
    const err = {
      headers: { 'retry-after': 9 }, // plain object, value is number
    };
    await expect(retry(flakyWithOnceError(err, 'ok'), { retries: 1 })).resolves.toBe('ok');
    const computed = await getComputedOverrideMs(5);
    expect(computed).toBe(9000); // 9 seconds
  });

  it('covers getHeader returning undefined when val is neither string nor number', async () => {
    const err = {
      headers: { 'retry-after': { some: 'object' } }, // matches key, wrong type
      status: 429, // so we still get a floor value
    };
    await expect(retry(flakyWithOnceError(err, 'ok'), { retries: 1 })).resolves.toBe('ok');

    const computed = await getComputedOverrideMs(50);
    // since header value was ignored, fallback to status floor (1000ms)
    expect(computed).toBe(1000);
  });
});

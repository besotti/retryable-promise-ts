import { describe, it, expect, vi, afterEach } from 'vitest';
import { retry } from '../src';
import { withFakeTimers } from './utils/with-fake-timers';

// dynamic mock so each test can set the hint
let mockedHint: number | undefined = undefined;
vi.mock('../src/core/httpRetrySignals', () => ({
  extractRetryAfterMs: () => mockedHint,
}));

const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

afterEach(() => {
  mockedHint = undefined;
  vi.restoreAllMocks();
});

describe('retry — HTTP hints (integration)', () => {
  it(
    'uses base(ctx) when hint is undefined',
    withFakeTimers(async () => {
      mockedHint = undefined; // no HTTP floor

      // base override: 150ms
      const base = vi.fn(async () => 150);

      let calls = 0;
      const fn = vi.fn(async () => {
        calls++;
        if (calls === 1) throw new Error('boom');
        return 'ok';
      });

      const p = retry(fn, {
        retries: 1,
        nextDelayOverride: base,
        // optional: a noop delayFn so suggestedDelayMs is irrelevant
        delayFn: async () => {},
      });

      await flush();
      expect(fn).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(149);
      await flush();
      expect(fn).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1);
      await flush();
      expect(fn).toHaveBeenCalledTimes(2);

      await p;
      expect(base).toHaveBeenCalledTimes(1);
    })
  );

  it(
    'uses suggestedDelayMs when base is missing and hint is undefined',
    withFakeTimers(async () => {
      mockedHint = undefined;

      // suggestedDelayMs = 120ms via delayFn
      const delayFn = vi.fn(async () => {
        await new Promise(r => setTimeout(r, 120));
      });

      let calls = 0;
      const fn = vi.fn(async () => {
        calls++;
        if (calls === 1) throw new Error('boom');
        return 'ok';
      });

      const p = retry(fn, { retries: 1, delayFn });

      await flush();
      expect(fn).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(119);
      await flush();
      expect(fn).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1);
      await flush();
      expect(fn).toHaveBeenCalledTimes(2);

      await p;
      expect(delayFn).toHaveBeenCalledTimes(1);
    })
  );

  it(
    'keeps suggestedDelayMs when it is higher than hint',
    withFakeTimers(async () => {
      mockedHint = 200;

      // suggestedDelayMs = 300ms (higher than hint)
      const delayFn = vi.fn(async () => {
        await new Promise(r => setTimeout(r, 300));
      });

      let calls = 0;
      const fn = vi.fn(async () => {
        calls++;
        if (calls === 1) throw new Error('boom');
        return 'ok';
      });

      const p = retry(fn, { retries: 1, delayFn });

      await flush();
      expect(fn).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(299);
      await flush();
      expect(fn).toHaveBeenCalledTimes(1); // still waiting (300 > 200)

      await vi.advanceTimersByTimeAsync(1);
      await flush();
      expect(fn).toHaveBeenCalledTimes(2);

      await p;
    })
  );

  it(
    'handles hint=0 by using inner delay (floor of 0 is a no-op)',
    withFakeTimers(async () => {
      mockedHint = 0;

      // suggestedDelayMs = 90ms
      const delayFn = vi.fn(async () => {
        await new Promise(r => setTimeout(r, 90));
      });

      let calls = 0;
      const fn = vi.fn(async () => {
        calls++;
        if (calls === 1) throw new Error('boom');
        return 'ok';
      });

      const p = retry(fn, { retries: 1, delayFn });

      await flush();
      expect(fn).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(89);
      await flush();
      expect(fn).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1);
      await flush();
      expect(fn).toHaveBeenCalledTimes(2);

      await p;
    })
  );
});

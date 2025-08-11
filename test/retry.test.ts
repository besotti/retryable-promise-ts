import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { retry } from '../src';
import * as delayMsMod from '../src/core/delayMs';

describe('retry function', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers(); // important, otherwise later tests may hang
  });

  it('succeeds on first attempt', async () => {
    const mockFn = vi.fn().mockResolvedValue('success');
    const promise = retry(mockFn);

    await expect(promise).resolves.toBe('success');
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('retries after failures and then succeeds', async () => {
    // Mock function that fails twice and then succeeds
    const mockFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('Error on 1st attempt'))
      .mockRejectedValueOnce(new Error('Error on 2nd attempt'))
      .mockResolvedValue('success');

    const promise = retry(mockFn);

    // Run all timers for the retries
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe('success');

    // Should be called exactly 3 times
    expect(mockFn).toHaveBeenCalledTimes(3);
  });

  it('calls onRetry with error and attempt number', async () => {
    const error1 = new Error('First error');
    const error2 = new Error('Second error');
    const mockFn = vi
      .fn()
      .mockRejectedValueOnce(error1)
      .mockRejectedValueOnce(error2)
      .mockResolvedValue('success');

    // Spy function for the callback
    const onRetry = vi.fn();

    const promise = retry(mockFn, { onRetry });

    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe('success');

    // Callback checks
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenNthCalledWith(1, error1, 1);
    expect(onRetry).toHaveBeenNthCalledWith(2, error2, 2);
  });

  it('does not crash when no onRetry is provided', async () => {
    const mockFn = vi.fn().mockRejectedValueOnce(new Error('Error')).mockResolvedValue('success');

    const promise = retry(mockFn); // no onRetry here

    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe('success');
  });

  it('only calls onRetry with actual Error objects', async () => {
    // A real Error vs. a string
    const errorObj = new Error('Real error');
    const nonErrorObj = 'Not an error object';

    const mockFn = vi
      .fn()
      .mockRejectedValueOnce(errorObj)
      .mockRejectedValueOnce(nonErrorObj)
      .mockResolvedValue('success');

    const onRetry = vi.fn();
    const promise = retry(mockFn, { onRetry });

    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe('success');

    // onRetry should only be called once (with the Error object)
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(errorObj, 1);
  });

  it('gives up after max attempts', async () => {
    const finalError = new Error('Final error');
    const mockFn = vi.fn().mockRejectedValue(finalError);

    // 2 retries = 3 attempts total
    const promise = retry(mockFn, { retries: 2 });
    const promiseResult = promise.catch(err => err); // catch error

    await vi.runAllTimersAsync();
    const result = await promiseResult;

    expect(result).toEqual(finalError);
    expect(mockFn).toHaveBeenCalledTimes(3); // 1 + 2 retries
  });

  it('returns the last error', async () => {
    const error1 = new Error('Error 1');
    const error2 = new Error('Error 2');
    const finalError = new Error('Final error');

    const mockFn = vi
      .fn()
      .mockRejectedValueOnce(error1)
      .mockRejectedValueOnce(error2)
      .mockRejectedValue(finalError);

    const promise = retry(mockFn, { retries: 2 });
    const promiseResult = promise.catch(err => err);

    await vi.runAllTimersAsync();
    const result = await promiseResult;

    expect(result).toEqual(finalError);
  });
});
describe('retry → runDelayWithOverride target calculation', () => {
  it('nimmt suggested (250) > waited (~100) → extra ≈ 150 und ruft delayMs(extra)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));

    // Spy auf delayMs (nur EXTRA-Delay, base-delay kommt über delayFn → setTimeout)
    const delaySpy = vi.spyOn(delayMsMod, 'delayMs').mockResolvedValue();

    // 1. Versuch schlägt fehl, 2. Versuch liefert Erfolg
    let attempts = 0;
    const fn = async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('boom');
      return 42;
    };

    // base delay für waited ≈ 100 ms
    const delayFn = async () => new Promise<void>(r => setTimeout(r, 100));

    // override liefert target = 250 ms
    const nextDelayOverride = vi.fn().mockResolvedValue(250);

    const p = retry(fn, {
      retries: 2,
      delayFn,
      nextDelayOverride,
      maxElapsedTime: 10_000,
    });

    // base-delay ablaufen lassen → waited ≈ 100
    await vi.advanceTimersByTimeAsync(100);

    // unser base-override wurde via withHttpHints(...) aufgerufen
    expect(nextDelayOverride).toHaveBeenCalledTimes(1);
    const ctx = nextDelayOverride.mock.calls[0][0];
    expect(ctx.attempt).toBe(1);
    expect(Math.abs(ctx.suggestedDelayMs - 100)).toBeLessThanOrEqual(5);

    // target = 250, waited ≈ 100 → extra ≈ 150 → delayMs(extra) muss gerufen werden
    expect(delaySpy).toHaveBeenCalledTimes(1);
    const extraArg = delaySpy.mock.calls[0][0] as number;
    expect(Math.abs(extraArg - 150)).toBeLessThanOrEqual(5);

    // retry schließt erfolgreich ab (2. Versuch)
    const out = await p;
    expect(out).toBe(42);
    expect(attempts).toBe(2);

    delaySpy.mockRestore();
    vi.useRealTimers();
  });

  it('negatives suggested wird auf 0 geklemmt → kein extra-Delay', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));

    const delaySpy = vi.spyOn(delayMsMod, 'delayMs').mockResolvedValue();

    let attempts = 0;
    const fn = async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('boom');
      return 'ok';
    };

    const delayFn = async () => new Promise<void>(r => setTimeout(r, 100));

    // suggested = -50 → target = 0 → extra = max(0, 0 - waited) = 0 → kein delayMs-Aufruf
    const nextDelayOverride = vi.fn().mockResolvedValue(-50);

    const p = retry(fn, {
      retries: 2,
      delayFn,
      nextDelayOverride,
      maxElapsedTime: 10_000,
    });

    await vi.advanceTimersByTimeAsync(100);
    const out = await p;

    expect(out).toBe('ok');
    expect(attempts).toBe(2);
    expect(nextDelayOverride).toHaveBeenCalledTimes(1);
    expect(delaySpy).not.toHaveBeenCalled();

    delaySpy.mockRestore();
    vi.useRealTimers();
  });
});

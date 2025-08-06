import { retry } from '../src';
import { createBackoffDelayFn } from '../src';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('retry with backoff strategies', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  const createFailingFunction = (failTimes: number) => {
    let callCount = 0;
    return vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount <= failTimes) {
        return Promise.reject(new Error(`fail ${callCount}`));
      }
      return Promise.resolve('success');
    });
  };

  it('should use constant backoff', async () => {
    const fn = createFailingFunction(2);
    const delayFn = createBackoffDelayFn('constant', 1000);

    const promise = retry(fn, {
      retries: 2,
      delayFn,
    });

    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe('success');
    expect(fn).toHaveBeenCalledTimes(3); // 2 error, 1 success
  });

  it('should use linear backoff', async () => {
    const fn = createFailingFunction(2);
    const delayFn = createBackoffDelayFn('linear', 500); // 500, 1000

    const promise = retry(fn, {
      retries: 2,
      delayFn,
    });

    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should use exponential backoff', async () => {
    const fn = createFailingFunction(2);
    const delayFn = createBackoffDelayFn('exponential', 200); // 200, 400

    const promise = retry(fn, {
      retries: 2,
      delayFn,
    });

    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should use custom backoff function', async () => {
    const fn = createFailingFunction(2);
    const delayFn = createBackoffDelayFn(attempt => attempt * 123); // 123, 246

    const promise = retry(fn, {
      retries: 2,
      delayFn,
    });

    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

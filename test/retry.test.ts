import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { retry } from '../src';

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

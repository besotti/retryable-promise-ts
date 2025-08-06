import { retry } from '../src';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('retry (timeout enforcement)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('should timeout before the function resolves', async () => {
    const mockFn = vi.fn().mockImplementation((signal?: AbortSignal) => {
      return new Promise((resolve, reject) => {
        let settled = false;

        const id = setTimeout(() => {
          if (settled) return;
          settled = true;
          resolve('success');
        }, 3000);

        signal?.addEventListener(
          'abort',
          () => {
            if (settled) return;
            settled = true;
            clearTimeout(id);
            reject(new Error('Operation aborted'));
          },
          { once: true }
        );
      });
    });

    const resultPromise = retry(mockFn, {
      timeout: 1000,
      retries: 0,
    });

    await expect(resultPromise).rejects.toThrow('Operation aborted');
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('should reject with error when AbortSignal.timeout is not supported', async () => {
    // Mock AbortSignal.timeout to throw an error
    const originalTimeout = AbortSignal.timeout;
    vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => {
      throw new Error('AbortSignal.timeout is not implemented');
    });

    const mockFn = vi.fn().mockResolvedValue('success');

    const resultPromise = retry(mockFn, {
      timeout: 1000,
      retries: 0,
    });

    await expect(resultPromise).rejects.toThrow('AbortSignal.timeout not supported');
    expect(mockFn).not.toHaveBeenCalled();

    // Restore the original implementation after the test
    AbortSignal.timeout = originalTimeout;
  });
});

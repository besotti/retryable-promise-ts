import { retry } from '../src';
import { mergeAbortSignals } from '../src/utils/mergeAbortSignals';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('retry (abort signal handling)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('should abort the initial run when signal is aborted', async () => {
    const controller = new AbortController();
    const signal = controller.signal;

    const mockFn = vi.fn().mockImplementation((signal?: AbortSignal) => {
      return new Promise((resolve, reject) => {
        let settled = false;

        // Simulate a long-running operation
        const id = setTimeout(() => {
          if (settled) return;
          settled = true;
          resolve('success');
        }, 1000);

        // Listen for abort signal
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
      signal,
      retries: 2,
    });

    // Abort immediately (during the initial run)
    controller.abort();

    await expect(resultPromise).rejects.toThrow('Operation aborted');
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  it('should abort during a retry attempt when signal is aborted', async () => {
    const controller = new AbortController();
    const signal = controller.signal;

    // Create promises to control the flow of the test
    let retryReject: (error: Error) => void;
    const retryPromise = new Promise<string>((_, reject) => {
      retryReject = reject;
    });

    // Track which attempt we're on
    let attemptCount = 0;

    // Mock function that fails on the first call, then waits for manual resolution/rejection on the second call
    const mockFn = vi.fn().mockImplementation((signal?: AbortSignal) => {
      attemptCount++;

      if (attemptCount === 1) {
        // First call - fail immediately
        return Promise.reject(new Error('First attempt failed'));
      }

      // Second call - return the promise we control
      // Set up abort listener
      signal?.addEventListener(
        'abort',
        () => {
          retryReject(new Error('Operation aborted'));
        },
        { once: true }
      );

      return retryPromise;
    });

    // Start the retry process
    const resultPromise = retry(mockFn, {
      signal,
      retries: 2,
    });

    // Wait for the first attempt to fail and the second attempt to start
    await vi.runAllTimersAsync();

    // Verify we're on the second attempt
    expect(attemptCount).toBe(2);

    // Abort during the second attempt (first retry)
    controller.abort();

    // Verify the promise rejects with the expected error
    await expect(resultPromise).rejects.toThrow('Operation aborted');
    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  it('should not attempt further retries after being finalized by abort', async () => {
    const controller = new AbortController();
    const signal = controller.signal;

    // Track when the function is called
    let attemptCount = 0;
    let attemptPromiseResolve: () => void;
    const attemptPromise = new Promise<void>(resolve => {
      attemptPromiseResolve = resolve;
    });

    // Create a mock function that will be called for each retry attempt
    const mockFn = vi.fn().mockImplementation(() => {
      attemptCount++;

      // Signal that the first attempt has been made
      if (attemptCount === 1) {
        attemptPromiseResolve();
      }

      // Always reject to trigger retries
      return Promise.reject(new Error('Test error'));
    });

    // Start the retry process with a high number of retries
    const resultPromise = retry(mockFn, {
      signal,
      retries: 10, // Set high to ensure we're not hitting the retry limit
    }).catch(err => err); // Handle the rejection to avoid unhandled promise rejection

    // Wait for the first attempt to complete
    await attemptPromise;

    // Verify the function was called once
    expect(attemptCount).toBe(1);

    // Abort the operation, which should finalize it
    controller.abort();

    // Wait for the promise to settle
    const error = await resultPromise;
    expect(error).toBeInstanceOf(Error);

    // Record the number of calls at this point
    const callCountAfterAbort = attemptCount;

    // Advance timers to give an opportunity for more retries if not properly finalized
    await vi.runAllTimersAsync();

    // Verify no additional calls were made after abort
    // This confirms that the line "if (isFinalized) return"; prevented further execution
    expect(attemptCount).toBe(callCountAfterAbort);
  });
});

describe('mergeAbortSignals', () => {
  it('should handle undefined signals in the array', () => {
    // Create an array with a valid signal and an undefined signal
    const controller = new AbortController();
    const validSignal = controller.signal;
    const signals = [validSignal, undefined];

    // Call mergeAbortSignals with the array containing undefined
    const result = mergeAbortSignals(signals);

    // Verify the result is a valid AbortSignal
    expect(result).toBeInstanceOf(AbortSignal);
    expect(result.aborted).toBe(false);

    // Verify the signal works correctly
    controller.abort();
    expect(result.aborted).toBe(true);
  });
});

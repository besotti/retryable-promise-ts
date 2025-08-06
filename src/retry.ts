import { mergeAbortSignals } from './utils/mergeAbortSignals';
import { RateLimiter, RateLimitOptions } from './utils/rateLimiter';

export interface RetryOptions {
  retries?: number;
  timeout?: number;
  signal?: AbortSignal;
  delayFn?: (attempt: number) => Promise<void>;
  onRetry?: (error: Error, attempt: number) => void;
  rateLimiter?: RateLimiter;
  rateLimit?: RateLimitOptions;
}

/**
 * Executes an async function with retry logic.
 * 
 * @template T - Return type of the function
 * @param fn - The function to execute (optionally receives an AbortSignal)
 * @param options - Configuration for retry behavior
 * @returns Promise with the result or Error after all attempts
 * 
 * Example:
 * ```
 * // API call with 3 retries and exponential delay
 * const data = await retry(
 *   () => fetchData('/api/users'),
 *   { 
 *     retries: 3,
 *     delayFn: createBackoffDelayFn('exponential', 1000)
 *   }
 * );
 * ```
 */
export const retry = <T>(
  fn: (signal?: AbortSignal) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> => {
  const { 
    retries = 3, 
    timeout, 
    signal: externalSignal, 
    delayFn, 
    onRetry,
    rateLimiter: providedRateLimiter,
    rateLimit
  } = options;

  // Create a rate limiter if options are provided, or use the provided one
  const rateLimiter = rateLimit 
    ? new RateLimiter(rateLimit) 
    : providedRateLimiter;

  return new Promise<T>((resolve, reject) => {
    let attempts = 0;
    let isFinalized = false;

    const execute = async () => {
      if (isFinalized) return;

      const signals: AbortSignal[] = [];
      if (externalSignal) signals.push(externalSignal);

      if (timeout !== undefined) {
        try {
          signals.push(AbortSignal.timeout(timeout));
        } catch {
          isFinalized = true;
          reject(new Error('AbortSignal.timeout not supported'));
          return;
        }
      }

      const combinedSignal = mergeAbortSignals(signals);

      // Handle abort signal to prevent further retries
      if (combinedSignal.aborted) {
        isFinalized = true;
      } else {
        combinedSignal.addEventListener('abort', () => {
          isFinalized = true;
          reject(new Error('Operation aborted'));
        }, { once: true });
      }

      try {
        // Apply rate limiting if a rate limiter is provided
        if (rateLimiter) {
          await rateLimiter.acquire();
        }

        const result = await fn(combinedSignal);
        isFinalized = true;
        resolve(result);
      } catch (error) {
        if (isFinalized || combinedSignal.aborted) {
          isFinalized = true;
          reject(error);
          return;
        }

        attempts++;
        
        if (onRetry && error instanceof Error) {
          onRetry(error, attempts);
        }

        if (attempts > retries) {
          isFinalized = true;
          reject(error);
          return;
        }

        if (delayFn) {
          await delayFn(attempts);
        } else {
          await Promise.resolve();
        }

        execute();
      }
    };

    execute();
  });
};

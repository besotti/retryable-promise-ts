import { mergeAbortSignals } from './utils/mergeAbortSignals';
import { RateLimiter } from './utils/rateLimiter';
import { NextDelayOverride, RetryOptions } from './types';
import { runDelayWithOverride } from './core/delayWithOverride';
import { extractRetryAfterMs } from './core/httpRetrySignals';

export type RetryIf = (error: unknown, attempt: number) => boolean | Promise<boolean>;
export type RetryOnResult<T> = (result: T, attempt: number) => boolean | Promise<boolean>;

/**
 * Executes an async function with configurable retry logic.
 *
 * Features:
 * - Retry on error or based on the returned result
 * - Optional timeout and AbortSignal support
 * - Rate limiting (external limiter or config-based)
 * - Adjustable delays with override functions and HTTP `Retry-After` handling
 * - Stops on max retries, max elapsed time, or abort signal
 *
 * @template T Return type of the function
 * @param fn       Function to execute. Receives an optional AbortSignal.
 * @param options  Retry configuration (retries, delay, abort, rate limit, hooks, etc.)
 * @returns        Resolves with the successful result or rejects after all retries fail
 *
 * @throws Error with reason if aborted, max time exceeded, or no retry condition is met
 */
export const retry = async <T>(
  fn: (signal?: AbortSignal) => Promise<T>,
  options: RetryOptions<T> = {}
): Promise<T> => {
  const {
    retries = 3,
    timeout,
    signal: externalSignal,
    delayFn,
    onRetry,
    rateLimiter: providedRateLimiter,
    rateLimit,
    retryIf,
    retryOnResult,
    maxElapsedTime,
    nextDelayOverride,
    onGiveUp,
  } = options;

  const rateLimiter = rateLimit ? new RateLimiter(rateLimit) : providedRateLimiter;
  const startTime = Date.now();

  const withHttpHints =
    <U>(base?: NextDelayOverride<U>, err?: unknown): NextDelayOverride<U> | undefined =>
    async ctx => {
      const hinted = extractRetryAfterMs(err);
      const inner = base ? await base(ctx) : ctx.suggestedDelayMs;
      return typeof hinted === 'number' ? Math.max(hinted, inner) : inner;
    };

  const fail = async (err: unknown, attempts: number): Promise<never> => {
    try {
      await onGiveUp?.(err, attempts);
    } catch {
      /* do nothing*/
    }
    throw err;
  };

  let attempts = 0;

  for (;;) {
    if (maxElapsedTime !== undefined && Date.now() - startTime >= maxElapsedTime) {
      const e = new Error('Retry maxElapsedTime exceeded');
      e.name = 'RetryMaxElapsedTimeExceeded';
      return fail(e, attempts);
    }

    const signals: AbortSignal[] = [];
    if (externalSignal) signals.push(externalSignal);

    if (timeout !== undefined) {
      try {
        signals.push(AbortSignal.timeout(timeout));
      } catch {
        return fail(new Error('AbortSignal.timeout not supported'), attempts);
      }
    }

    const combined = mergeAbortSignals(signals);
    if (combined.aborted) return fail(new Error('Operation aborted'), attempts);

    const abortPromise = new Promise<never>((_, rej) => {
      combined.addEventListener('abort', () => rej(new Error('Operation aborted')), { once: true });
    });

    try {
      if (rateLimiter) await rateLimiter.acquire();

      const result = await Promise.race<[T, never]>([
        fn(combined) as unknown as Promise<[T, never]>,
        abortPromise,
      ]).then(v => (Array.isArray(v) ? v[0] : (v as unknown as T)));

      if (retryOnResult && (await retryOnResult(result, attempts + 1))) {
        attempts++;
        if (attempts > retries) return result;

        const waited = await runDelayWithOverride<T>({
          attempt: attempts,
          delayFn,
          nextDelayOverride,
          maxElapsedTime,
          startTime,
          lastResult: result,
        });

        if (!waited) return result;
        continue;
      }

      return result;
    } catch (err) {
      if (combined.aborted) return fail(err, attempts + 1);

      const canRetry = attempts < retries && (!retryIf || (await retryIf(err, attempts + 1)));
      if (!canRetry) return fail(err, attempts + 1);

      attempts++;
      if (err instanceof Error) onRetry?.(err, attempts);

      const waited = await runDelayWithOverride<T>({
        attempt: attempts,
        delayFn,
        nextDelayOverride: withHttpHints(nextDelayOverride, err),
        maxElapsedTime,
        startTime,
        lastError: err,
      });

      if (!waited) return fail(err, attempts);
    }
  }
};

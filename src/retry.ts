import { mergeAbortSignals } from './utils/mergeAbortSignals';
import { RateLimiter } from './utils/rateLimiter';
import { NextDelayOverride, RetryOptions } from './types';
import { runDelayWithOverride } from './core/delayWithOverride';
import { extractRetryAfterMs } from './core/httpRetrySignals';

export type RetryIf = (error: unknown, attempt: number) => boolean | Promise<boolean>;
export type RetryOnResult<T> = (result: T, attempt: number) => boolean | Promise<boolean>;

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

  // Create a rate limiter if options are provided or use the provided one
  const rateLimiter = rateLimit ? new RateLimiter(rateLimit) : providedRateLimiter;

  const startTime = Date.now();

  /** wrap nextDelayOverride to parse http errors as a floor (Retry-After / RateLimit-Reset) */
  const wrapWithHttpHints = <T>(
    base?: NextDelayOverride<T>,
    err?: unknown
  ): NextDelayOverride<T> | undefined => {
    return async ctx => {
      const hinted = extractRetryAfterMs(err);
      const inner = base ? await base(ctx) : ctx.suggestedDelayMs;

      if (typeof hinted === 'number') {
        return Math.max(hinted, inner);
      }
      return inner;
    };
  };

  return new Promise<T>((resolve, reject) => {
    let attempts = 0;
    let isFinalized = false;

    const finalizeReject = (lastError: unknown, attemptsForCb: number): void => {
      if (isFinalized) return;
      isFinalized = true;

      if (onGiveUp) {
        Promise.resolve(onGiveUp(lastError, attemptsForCb)).catch(() => {});
      }
      reject(lastError);
    };

    const execute = async (): Promise<void> => {
      if (isFinalized) return;

      // check global budget
      if (maxElapsedTime !== undefined && Date.now() - startTime >= maxElapsedTime) {
        const e = new Error('Retry maxElapsedTime exceeded');
        e.name = 'RetryMaxElapsedTimeExceeded';

        finalizeReject(e, attempts);
        return;
      }

      const signals: AbortSignal[] = [];
      if (externalSignal) signals.push(externalSignal);

      if (timeout !== undefined) {
        try {
          signals.push(AbortSignal.timeout(timeout));
        } catch {
          finalizeReject(new Error('AbortSignal.timeout not supported'), attempts);
          return;
        }
      }

      const combinedSignal = mergeAbortSignals(signals);

      // Handle abort signal to prevent further retries
      if (combinedSignal.aborted) {
        finalizeReject(new Error('Operation aborted'), attempts);
        return;
      } else {
        combinedSignal.addEventListener(
          'abort',
          () => {
            finalizeReject(new Error('Operation aborted'), attempts);
          },
          { once: true }
        );
      }

      try {
        // Apply rate limiting if a rate limiter is provided
        if (rateLimiter) {
          await rateLimiter.acquire();
        }

        const result = await fn(combinedSignal);

        if (retryOnResult && (await retryOnResult(result, attempts + 1))) {
          attempts++;

          if (attempts > retries) {
            isFinalized = true;
            resolve(result);
            return;
          }

          const waited = await runDelayWithOverride<T>({
            attempt: attempts,
            delayFn,
            nextDelayOverride,
            maxElapsedTime,
            startTime,
            lastResult: result,
          });

          if (!waited) {
            isFinalized = true;
            resolve(result); // return best result - not enough budget
            return;
          }

          // next try
          execute();
          return;
        }

        // success
        isFinalized = true;
        resolve(result);
      } catch (err: unknown) {
        if (isFinalized || combinedSignal.aborted) {
          finalizeReject(err, attempts + 1 /* the in-flight attempt errored */);
          return;
        }

        // Error-Filter (optional)
        const shouldRetry = attempts < retries && (!retryIf || (await retryIf(err, attempts + 1)));
        if (!shouldRetry) {
          finalizeReject(err, attempts + 1);
          return;
        }

        attempts++;
        if (err instanceof Error) {
          onRetry?.(err, attempts);
        }

        // calculate delay (if possible, override + retry-after-floor)
        const waited = await runDelayWithOverride<T>({
          attempt: attempts,
          delayFn,
          nextDelayOverride: wrapWithHttpHints(nextDelayOverride, err),
          maxElapsedTime,
          startTime,
          lastError: err,
        });

        if (!waited) {
          finalizeReject(err, attempts);
          return;
        }

        await execute();
      }
    };

    execute();
  });
};

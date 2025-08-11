import { delayMs } from './delayMs';
import { NextDelayOverride } from '../types';

export const runDelayWithOverride = async <T>(args: {
  attempt: number;
  delayFn?: (attempt: number) => Promise<void>;
  nextDelayOverride?: NextDelayOverride<T>;
  maxElapsedTime?: number;
  startTime: number;
  lastError?: unknown;
  lastResult?: T;
}): Promise<boolean> => {
  const { attempt, delayFn, nextDelayOverride, maxElapsedTime, startTime, lastError, lastResult } =
    args;

  // check budget before waiting
  if (maxElapsedTime !== undefined && Date.now() - startTime >= maxElapsedTime) {
    return false;
  }

  const before = Date.now();
  if (delayFn) {
    await delayFn(attempt);
  }

  const waited = Date.now() - before;

  // Optional: Override (Floor). if override returns a number, it will be used as a delay
  if (nextDelayOverride) {
    const suggested = await nextDelayOverride({
      attempt,
      lastError,
      lastResult,
      suggestedDelayMs: waited,
    });

    const extra = Math.max(0, suggested - waited);

    if (extra > 0) {
      // check time budget
      if (maxElapsedTime !== undefined) {
        const elapsed = Date.now() - startTime;
        if (elapsed + extra >= maxElapsedTime) {
          return false;
        }
      }
      await delayMs(extra);
    }
  }

  // check budget after waiting
  return !(maxElapsedTime !== undefined && Date.now() - startTime >= maxElapsedTime);
};

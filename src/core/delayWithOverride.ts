import { delayMs } from './delayMs';
import { NextDelayOverride } from '../types';

/**
 * Waits using a delay function, then optionally adjusts the wait time using an override.
 * Will not run if the total elapsed time would exceed the allowed maximum.
 *
 * @param args.attempt         Current attempt number.
 * @param args.delayFn         Function to handle the base delay.
 * @param args.nextDelayOverride Function that can override the total delay.
 * @param args.maxElapsedTime  Optional max time in ms for all attempts.
 * @param args.startTime       Timestamp (ms) when the process started.
 * @param args.lastError       The last error thrown, if any.
 * @param args.lastResult      The last result returned, if any.
 * @returns True if there is still time left in the budget, false otherwise.
 */
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

  const hasBudget = (extra = 0) => {
    if (maxElapsedTime === undefined) return true;
    const elapsed = Date.now() - startTime;
    return elapsed + extra < maxElapsedTime;
  };

  if (!hasBudget()) return false;

  let waited = 0;
  if (delayFn) {
    const t0 = Date.now();
    await delayFn(attempt);
    waited = Date.now() - t0;
  }

  if (!nextDelayOverride) return hasBudget();

  const suggested = await nextDelayOverride({
    attempt,
    lastError,
    lastResult,
    suggestedDelayMs: waited,
  });

  const target =
    typeof suggested === 'number' && Number.isFinite(suggested) ? Math.max(0, suggested) : waited;

  const extra = Math.max(0, target - waited);
  if (extra === 0) return hasBudget();

  if (!hasBudget(extra)) return false;

  await delayMs(extra);
  return hasBudget();
};

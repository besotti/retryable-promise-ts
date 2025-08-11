/**
 * Waits for the given number of milliseconds before continuing.
 *
 * @param ms Milliseconds to wait. Negative values are treated as 0.
 */
export const delayMs = (ms: number) => new Promise<void>(res => setTimeout(res, Math.max(0, ms)));

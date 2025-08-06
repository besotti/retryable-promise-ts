/**
 * Combines multiple AbortSignals into a single signal
 * 
 * If any of the input signals is aborted, the combined
 * signal will also be aborted.
 */
export const mergeAbortSignals = (signals: (AbortSignal | undefined)[]): AbortSignal => {
  const controller = new AbortController();

  for (const signal of signals) {
    if (!signal) continue;

    if (signal.aborted) {
      controller.abort();
      break;
    }

    // Using { once: true } to prevent memory leaks
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  return controller.signal;
};

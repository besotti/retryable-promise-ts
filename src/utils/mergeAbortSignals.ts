/**
 * Combines multiple AbortSignals into a single signal
 *
 * If any of the input signals is aborted, the combined
 * signal will also be aborted.
 */
export const mergeAbortSignals = (
  signals: (AbortSignal | undefined)[],
  controller?: AbortController
): AbortSignal => {
  const internalController = controller ?? new AbortController();

  for (const signal of signals) {
    if (!signal) continue;

    if (signal.aborted) {
      internalController.abort();
      break;
    }

    // Using { once: true } to prevent memory leaks
    signal.addEventListener('abort', () => internalController.abort(), { once: true });
  }

  return internalController.signal;
};

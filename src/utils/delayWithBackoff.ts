export type BackoffStrategy = 
  | 'constant'    // Constant delay
  | 'linear'      // Linear increasing delay
  | 'exponential' // Exponential increasing delay (2^n)
  | ((attempt: number) => number); // Custom function

/**
 * Creates a delay function with configurable backoff strategy
 * 
 * @param strategy - Type of delay between retry attempts
 * @param baseDelay - Base delay in ms (default: 1000ms)
 */
export const createBackoffDelayFn = (
  strategy: BackoffStrategy,
  baseDelay = 1000
): ((attempt: number) => Promise<void>) => {
  return async (attempt: number) => {
    let delay: number;

    if (typeof strategy === 'function') {
      // Custom function provided by user
      delay = strategy(attempt);
    } else if (strategy === 'linear') {
      // Linear: baseDelay * attemptNumber
      // e.g., 1000, 2000, 3000, ...
      delay = baseDelay * attempt;
    } else if (strategy === 'exponential') {
      // Exponential: baseDelay * 2^(attempt-1)
      // e.g., 1000, 2000, 4000, 8000, ...
      delay = baseDelay * Math.pow(2, attempt - 1);
    } else {
      // Constant: always baseDelay
      delay = baseDelay;
    }

    await new Promise(resolve => setTimeout(resolve, delay));
  };
};

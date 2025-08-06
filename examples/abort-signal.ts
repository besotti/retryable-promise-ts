/**
 * Abort Signal Example
 * 
 * This example demonstrates how to use AbortSignal with the retry function
 * to cancel operations that are in progress.
 */

import { retry, createBackoffDelayFn } from '../src';

// Simulate a long-running API call that respects abort signals
async function simulateLongApiCall(signal?: AbortSignal): Promise<string> {
  console.log('Starting long API call...');
  
  // This is how you'd typically check for abort in your own functions
  if (signal?.aborted) {
    throw new Error('Operation was aborted');
  }
  
  return new Promise((resolve, reject) => {
    // Set up a long operation (5 seconds)
    const timeoutId = setTimeout(() => {
      console.log('API call completed successfully');
      resolve('API response data');
    }, 5000);
    
    // Listen for abort signal to cancel the operation
    if (signal) {
      signal.addEventListener('abort', () => {
        clearTimeout(timeoutId);
        console.log('API call was aborted by signal');
        reject(new Error('Operation was aborted'));
      }, { once: true });
    }
  });
}

// Main function to demonstrate abort signal handling
async function main() {
  console.log('Starting abort signal example...\n');
  
  // Example 1: Manual abort after a delay
  console.log('Example 1: Manual abort after delay');
  const controller = new AbortController();
  
  // Set up a timeout to abort the operation after 2 seconds
  setTimeout(() => {
    console.log('Triggering abort after 2 seconds...');
    controller.abort();
  }, 2000);
  
  try {
    const result = await retry(
      (signal) => simulateLongApiCall(signal), // Pass the signal to our function
      {
        signal: controller.signal,
        retries: 2,
        delayFn: createBackoffDelayFn('constant', 1000),
        onRetry: (error, attempt) => {
          console.log(`Retry attempt ${attempt} after error: ${error.message}`);
        }
      }
    );
    console.log(`Success! Got result: ${result}\n`);
  } catch (error) {
    console.error(`Operation failed: ${error instanceof Error ? error.message : String(error)}\n`);
  }
  
  // Wait a moment before the next example
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Example 2: Using AbortSignal.timeout() (Node.js 16.14.0+ or modern browsers)
  console.log('Example 2: Using AbortSignal.timeout()');
  try {
    // Create a signal that automatically aborts after 3 seconds
    const timeoutSignal = AbortSignal.timeout ? 
      AbortSignal.timeout(3000) : 
      new AbortController().signal; // Fallback for environments without timeout support
    
    if (!AbortSignal.timeout) {
      console.log('Note: AbortSignal.timeout() is not supported in this environment');
    }
    
    const result = await retry(
      (signal) => simulateLongApiCall(signal),
      {
        signal: timeoutSignal,
        retries: 2,
        onRetry: (error, attempt) => {
          console.log(`Retry attempt ${attempt} after error: ${error.message}`);
        }
      }
    );
    console.log(`Success! Got result: ${result}`);
  } catch (error) {
    console.error(`Operation failed: ${error instanceof Error ? error.message : String(error)}\n`);
  }
  
  console.log('Abort signal example completed.');
}

// Run the example
main().catch(console.error);
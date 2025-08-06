/**
 * Timeout Handling Example
 * 
 * This example demonstrates how to use the timeout feature of the retry function
 * to limit the maximum time an operation can take.
 */

import { retry } from '../src';

// Simulate a slow API call that takes longer than we want to wait
async function simulateSlowApiCall(): Promise<string> {
  const delay = 2000; // 2 seconds
  console.log(`Making slow API call (${delay}ms delay)...`);
  
  return new Promise((resolve) => {
    setTimeout(() => {
      console.log('API call completed (but might have timed out already)');
      resolve('API response data');
    }, delay);
  });
}

// Main function to demonstrate timeout handling
async function main() {
  console.log('Starting timeout handling example...\n');
  
  // Example 1: Operation completes successfully (timeout > operation time)
  console.log('Example 1: Sufficient timeout (3000ms for a 2000ms operation)');
  try {
    const result = await retry(
      () => simulateSlowApiCall(),
      {
        timeout: 3000, // 3 seconds (longer than the operation)
        retries: 1
      }
    );
    console.log(`Success! Got result: ${result}\n`);
  } catch (error) {
    console.error(`Operation failed: ${error instanceof Error ? error.message : String(error)}\n`);
  }
  
  // Wait a moment before the next example
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Example 2: Operation times out (timeout < operation time)
  console.log('Example 2: Insufficient timeout (1000ms for a 2000ms operation)');
  try {
    const result = await retry(
      () => simulateSlowApiCall(),
      {
        timeout: 1000, // 1 second (shorter than the operation)
        retries: 1,
        onRetry: (error, attempt) => {
          console.log(`Retry attempt ${attempt} after error: ${error.message}`);
        }
      }
    );
    console.log(`Success! Got result: ${result}`);
  } catch (error) {
    console.error(`Operation failed: ${error instanceof Error ? error.message : String(error)}\n`);
  }
  
  console.log('Timeout handling example completed.');
}

// Run the example
main().catch(console.error);
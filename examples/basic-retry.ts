/**
 * Basic Retry Example
 * 
 * This example demonstrates the basic retry functionality of the library.
 * It shows how to use the retry function with a simple async operation
 * that fails a few times before succeeding.
 */

import { retry } from '../src';

// Simulate an API call that fails a few times before succeeding
let attemptCount = 0;
async function simulateApiCall(): Promise<string> {
  console.log(`API call attempt ${attemptCount + 1}`);
  
  // Fail the first 3 attempts
  if (attemptCount++ < 3) {
    console.log('  Request failed, will retry...');
    throw new Error('API request failed');
  }
  
  // Succeed on the 4th attempt
  console.log('  Request succeeded!');
  return 'API response data';
}

// Main function to demonstrate retry
async function main() {
  console.log('Starting basic retry example...\n');
  
  try {
    // Use the retry function with default options (3 retries)
    const result = await retry(
      () => simulateApiCall(),
      {
        // Optional callback that runs on each retry
        onRetry: (error, attempt) => {
          console.log(`  Retry attempt ${attempt} after error: ${error.message}\n`);
        }
      }
    );
    
    console.log(`\nSuccess! Got result: ${result}`);
  } catch (error) {
    console.error(`\nAll retries failed: ${error}`);
  }
}

// Run the example
main().catch(console.error);
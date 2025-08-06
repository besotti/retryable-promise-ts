/**
 * Backoff Strategies Example
 * 
 * This example demonstrates the different backoff strategies available
 * in the library: constant, linear, exponential, and custom.
 */

import { retry, createBackoffDelayFn, BackoffStrategy } from '../src';

// Simulate an API call that always fails (for demonstration purposes)
async function simulateFailingApiCall(): Promise<string> {
  console.log(`API call attempt at ${new Date().toISOString()}`);
  throw new Error('API request failed');
}

// Helper function to demonstrate a backoff strategy
async function demonstrateBackoffStrategy(
  strategyName: string, 
  strategy: BackoffStrategy,
  baseDelay = 1000
) {
  console.log(`\n--- ${strategyName} Backoff Strategy ---`);
  console.log(`Base delay: ${baseDelay}ms`);
  
  const startTime = Date.now();
  
  try {
    // Only try 3 times to keep the example runtime reasonable
    await retry(
      () => simulateFailingApiCall(),
      {
        retries: 3,
        delayFn: createBackoffDelayFn(strategy, baseDelay),
        onRetry: (error, attempt) => {
          const elapsedTime = Date.now() - startTime;
          console.log(`  Retry ${attempt} after ${elapsedTime}ms: ${error.message}`);
        }
      }
    );
  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.log(`All retries failed after ${totalTime}ms: ${error instanceof Error ? error.message : String(error)}\n`);
  }
}

// Main function to demonstrate different backoff strategies
async function main() {
  console.log('Starting backoff strategies example...');
  
  // Demonstrate constant backoff (same delay every time)
  await demonstrateBackoffStrategy('Constant', 'constant', 1000);
  
  // Demonstrate linear backoff (delay increases linearly)
  await demonstrateBackoffStrategy('Linear', 'linear', 1000);
  
  // Demonstrate exponential backoff (delay increases exponentially)
  await demonstrateBackoffStrategy('Exponential', 'exponential', 500);
  
  // Demonstrate custom backoff function
  const customBackoff = (attempt: number) => {
    // Example: Fibonacci sequence for delays
    const fibonacci = (n: number): number => {
      if (n <= 1) return n;
      return fibonacci(n - 1) + fibonacci(n - 2);
    };
    
    return fibonacci(attempt + 3) * 100; // 500, 800, 1300, 2100, ...
  };
  
  await demonstrateBackoffStrategy('Custom (Fibonacci)', customBackoff);
  
  console.log('Backoff strategies example completed.');
}

// Run the example
main().catch(console.error);
/**
 * Rate Limiting Example
 * 
 * This example demonstrates how to use the rate limiting functionality
 * to control the frequency of operations.
 */

import { retry, RateLimiter, JitterMode } from '../src';

// Simulate a simple API call
async function simulateApiCall(id: number): Promise<string> {
  console.log(`API call ${id} executed at ${new Date().toISOString()}`);
  return `Response from API call ${id}`;
}

// Helper function to demonstrate rate limiting
async function demonstrateRateLimiting(
  name: string,
  tokensPerInterval: number,
  interval: number,
  jitterMode?: JitterMode
) {
  console.log(`\n--- ${name} ---`);
  console.log(`Rate limit: ${tokensPerInterval} requests per ${interval}ms`);
  if (jitterMode) {
    console.log(`Jitter mode: ${jitterMode}`);
  }
  
  // Create a rate limiter
  const rateLimiter = new RateLimiter({
    tokensPerInterval,
    interval,
    jitterMode
  });
  
  const startTime = Date.now();
  
  // Execute multiple API calls with rate limiting
  const promises = Array.from({ length: 10 }, (_, i) => {
    return retry(
      () => simulateApiCall(i + 1),
      {
        // Use the rate limiter for all retry attempts
        rateLimiter
      }
    ).then(result => {
      const elapsedTime = Date.now() - startTime;
      console.log(`${result} (completed after ${elapsedTime}ms)`);
      return result;
    });
  });
  
  // Wait for all API calls to complete
  await Promise.all(promises);
  
  const totalTime = Date.now() - startTime;
  console.log(`All calls completed after ${totalTime}ms`);
}

// Main function to demonstrate rate limiting
async function main() {
  console.log('Starting rate limiting example...');
  
  // Example 1: Basic rate limiting (2 requests per second)
  await demonstrateRateLimiting(
    'Basic Rate Limiting',
    2,  // 2 tokens per interval
    1000 // 1000ms (1 second) interval
  );
  
  // Example 2: Rate limiting with full jitter
  await demonstrateRateLimiting(
    'Rate Limiting with Full Jitter',
    2,     // 2 tokens per interval
    1000,  // 1000ms (1 second) interval
    'full' // Full jitter mode
  );
  
  // Example 3: Rate limiting with equal jitter
  await demonstrateRateLimiting(
    'Rate Limiting with Equal Jitter',
    2,      // 2 tokens per interval
    1000,   // 1000ms (1 second) interval
    'equal' // Equal jitter mode
  );
  
  // Example 4: Higher throughput rate limiting
  await demonstrateRateLimiting(
    'Higher Throughput Rate Limiting',
    5,    // 5 tokens per interval
    1000  // 1000ms (1 second) interval
  );
  
  console.log('\nRate limiting example completed.');
}

// Run the example
main().catch(console.error);
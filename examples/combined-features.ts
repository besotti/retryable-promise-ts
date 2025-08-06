/**
 * Combined Features Example
 * 
 * This example demonstrates how to combine multiple features of the library
 * to create a robust and resilient API client.
 */

import { retry, createBackoffDelayFn, RateLimiter } from '../src';

// Simulate a realistic API client with various failure modes
class ApiClient {
  private baseUrl: string;
  private rateLimiter: RateLimiter;
  
  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    
    // Create a rate limiter for all API calls (3 requests per second)
    this.rateLimiter = new RateLimiter({
      tokensPerInterval: 3,
      interval: 1000,
      jitterMode: 'equal' // Use equal jitter to prevent thundering herd
    });
  }
  
  /**
   * Fetch data from the API with robust error handling
   */
  async fetchData(endpoint: string, options: {
    timeout?: number;
    signal?: AbortSignal;
    maxRetries?: number;
  } = {}): Promise<any> {
    const { timeout = 5000, signal, maxRetries = 3 } = options;
    
    // Use retry with multiple features
    return retry(
      async (innerSignal) => {
        console.log(`Fetching ${this.baseUrl}${endpoint}...`);
        
        // Check if operation was aborted
        if (innerSignal?.aborted) {
          throw new Error('Operation aborted');
        }
        
        // Simulate random failure modes
        const randomValue = Math.random();
        
        if (randomValue < 0.3) {
          // 30% chance of a network error
          console.log('  Network error occurred');
          throw new Error('Network error');
        } else if (randomValue < 0.5) {
          // 20% chance of a timeout
          console.log('  Request is taking too long...');
          
          // Set up a promise that respects the abort signal
          await new Promise((resolve, reject) => {
            const timeoutId = setTimeout(resolve, 6000); // Longer than our timeout
            
            // Listen for abort signal to cancel the operation
            innerSignal?.addEventListener('abort', () => {
              clearTimeout(timeoutId);
              reject(new Error('Operation aborted'));
            }, { once: true });
          });
          
          return { success: true, data: 'This will never be reached due to timeout' };
        } else if (randomValue < 0.7) {
          // 20% chance of a rate limit error
          console.log('  Rate limit exceeded');
          throw new Error('Rate limit exceeded');
        } else {
          // 30% chance of success
          console.log('  Request succeeded');
          return { 
            success: true, 
            data: `Data from ${endpoint}`,
            timestamp: new Date().toISOString()
          };
        }
      },
      {
        // Retry configuration
        retries: maxRetries,
        
        // Timeout handling
        timeout,
        
        // Abort signal handling
        signal,
        
        // Exponential backoff with jitter
        delayFn: createBackoffDelayFn('exponential', 500),
        
        // Rate limiting
        rateLimiter: this.rateLimiter,
        
        // Retry callback
        onRetry: (error, attempt) => {
          console.log(`  Retry ${attempt}/${maxRetries} after error: ${error.message}`);
        }
      }
    );
  }
}

// Main function to demonstrate combined features
async function main() {
  console.log('Starting combined features example...\n');
  
  // Create an API client
  const api = new ApiClient('https://api.example.com/');
  
  // Create an abort controller for manual cancellation
  const controller = new AbortController();
  
  // Set up a timeout to abort after 10 seconds (as a safety mechanism)
  const abortTimeout = setTimeout(() => {
    console.log('\nSafety timeout reached, aborting all pending requests');
    controller.abort();
  }, 10000);
  
  try {
    // Make multiple API requests in parallel
    const results = await Promise.all([
      api.fetchData('/users', { 
        signal: controller.signal,
        maxRetries: 5
      }).catch(e => ({ error: e.message })),
      
      api.fetchData('/products', { 
        timeout: 3000, // Shorter timeout
        signal: controller.signal
      }).catch(e => ({ error: e.message })),
      
      api.fetchData('/orders', { 
        signal: controller.signal
      }).catch(e => ({ error: e.message }))
    ]);
    
    // Display results
    console.log('\nResults:');
    results.forEach((result, i) => {
      const endpoint = ['/users', '/products', '/orders'][i];
      console.log(`\n${endpoint}:`, result);
    });
  } catch (error) {
    console.error(`\nUnexpected error: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    // Clean up the safety timeout
    clearTimeout(abortTimeout);
  }
  
  console.log('\nCombined features example completed.');
}

// Run the example
main().catch(console.error);
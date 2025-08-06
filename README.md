# retryable-promise-ts

[![npm version](https://img.shields.io/badge/npm-v1.0.0-blue.svg)](https://www.npmjs.com/package/retryable-promise-ts)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://www.typescriptlang.org/)
[![Test Coverage](https://img.shields.io/badge/coverage-high-brightgreen)](https://github.com/yourusername/retryable-promise-ts)

A robust, TypeScript-native library for handling async operations with retry logic, timeouts, backoff strategies, and rate limiting.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
  - [Basic Retry](#basic-retry)
  - [Backoff Strategies](#backoff-strategies)
  - [Timeout and Abort Control](#timeout-and-abort-control)
  - [Rate Limiting](#rate-limiting)
- [API Reference](#api-reference)
  - [retry()](#retry)
  - [createBackoffDelayFn()](#createbackoffdelayfn)
  - [RateLimiter](#ratelimiter)
- [Examples](#examples)
- [Advanced Features](#advanced-features)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

## Overview
`retryable-promise-ts` was built out of necessity. In multiple projects, I repeatedly ran into the same problem: writing robust retry logic for async operations. Existing libraries were either too simplistic or overloaded with features I didn’t need. This package focuses on the essentials: customizable backoff strategies, timeouts, abort signals, and proper error propagation without unnecessary bloat.

## Features

### Core Features

| Feature | Description | Purpose | Implementation |
|---------|-------------|---------|---------------|
| `basicRetry` | Retries failed async functions | Makes API calls more resilient against network issues | Simple retry loop with `retries: number` |
| `backoffStrategy` | Delay between retries (constant/linear/exponential) | Protects external systems from overload | `backoff: 'linear'/'exponential'/(n) => ms` |
| `timeoutPerAttempt` | Time limit per attempt | Prevents hanging promises | `Promise.race()` + `AbortController` |
| `abortable` | Manual cancellation of all retries | Essential for UI interactions | External signal + internal flag |
| `onRetry` | Hooks for each retry attempt | Excellent for logging and debugging | `onRetry: (error, attempt) => void` |
| `rateLimiting` | Controls the rate of operations | Prevents overloading external services | Token bucket algorithm with `rateLimiter` or `rateLimit` options |

## Installation

```bash
# Using npm
npm install retryable-promise-ts

# Using yarn
yarn add retryable-promise-ts

# Using pnpm
pnpm add retryable-promise-ts
```

## Usage

### Basic Retry

The simplest use case is to retry a function a specific number of times:

```typescript
import { retry } from 'retryable-promise-ts';

// Retry an API call up to 3 times (default)
const data = await retry(() => fetchData('/api/users'));

// Customize the number of retries
const result = await retry(() => fetchData('/api/products'), { 
  retries: 5 
});
```

### Backoff Strategies

To avoid overwhelming services, you can use different backoff strategies:

```typescript
import { retry, createBackoffDelayFn } from 'retryable-promise-ts';

// Exponential backoff (1s, 2s, 4s, 8s, ...)
const dataWithExponential = await retry(() => fetchData('/api/users'), {
  retries: 4,
  delayFn: createBackoffDelayFn('exponential', 1000)
});

// Linear backoff (1s, 2s, 3s, 4s, ...)
const dataWithLinear = await retry(() => fetchData('/api/users'), {
  retries: 4,
  delayFn: createBackoffDelayFn('linear', 1000)
});

// Constant backoff (1s, 1s, 1s, 1s, ...)
const dataWithConstant = await retry(() => fetchData('/api/users'), {
  retries: 4,
  delayFn: createBackoffDelayFn('constant', 1000)
});

// Custom backoff function
const dataWithCustom = await retry(() => fetchData('/api/users'), {
  retries: 4,
  delayFn: createBackoffDelayFn((attempt) => attempt * 500)
});
```

### Timeout and Abort Control

You can set timeouts for each attempt and abort the entire operation:

```typescript
import { retry } from 'retryable-promise-ts';

// Set a timeout of 2 seconds per attempt
const data = await retry(() => fetchData('/api/users'), {
  timeout: 2000
});

// Abort the operation manually
const controller = new AbortController();
const dataPromise = retry(() => fetchData('/api/users'), {
  signal: controller.signal
});

// Later, if needed:
controller.abort(); // This will stop all pending and future retry attempts
```

### Rate Limiting

You can control the rate of operations to avoid overwhelming external services:

```typescript
import { retry, RateLimiter } from 'retryable-promise-ts';

// Method 1: Create a shared rate limiter for multiple operations
const limiter = new RateLimiter({
  tokensPerInterval: 5,  // 5 operations allowed
  interval: 1000         // per second
});

// Use the shared rate limiter
const result1 = await retry(fetchData, { rateLimiter: limiter });
const result2 = await retry(fetchData, { rateLimiter: limiter });

// Method 2: Create a dedicated rate limiter for a specific operation
const result = await retry(fetchData, {
  rateLimit: {
    tokensPerInterval: 5,
    interval: 1000,
    jitterMode: 'equal'  // Add randomness to delays
  }
});
```

## API Reference

### retry()

```typescript
function retry<T>(
  fn: (signal?: AbortSignal) => Promise<T>,
  options?: RetryOptions
): Promise<T>
```

**Parameters:**

- `fn`: The async function to retry. It can optionally accept an AbortSignal.
- `options`: Configuration object with the following properties:
  - `retries`: Number of retry attempts (default: 3)
  - `timeout`: Time limit in ms for each attempt
  - `signal`: AbortSignal to cancel all retries
  - `delayFn`: Function that returns a promise resolving after a delay
  - `onRetry`: Callback function called after each failed attempt
  - `rateLimiter`: RateLimiter instance for controlling operation rate
  - `rateLimit`: Options to create a new RateLimiter

**Returns:**

- A Promise that resolves with the result of the function or rejects with the last error after all attempts.

### createBackoffDelayFn()

```typescript
function createBackoffDelayFn(
  strategy: BackoffStrategy,
  baseDelay?: number
): (attempt: number) => Promise<void>
```

**Parameters:**

- `strategy`: One of 'constant', 'linear', 'exponential', or a custom function
- `baseDelay`: Base delay in milliseconds (default: 1000)

**Returns:**

- A function that takes an attempt number and returns a Promise that resolves after the calculated delay.

### RateLimiter

```typescript
class RateLimiter {
  constructor(options: RateLimitOptions);
  acquire(): Promise<void>;
}
```

**Parameters for constructor:**

- `options`: Configuration object with the following properties:
  - `tokensPerInterval`: Number of operations allowed per interval
  - `interval`: Time interval in milliseconds
  - `jitterMode`: How to apply randomness to delays ('none', 'full', or 'equal')

**Methods:**

- `acquire()`: Acquires a token from the rate limiter. Returns a Promise that resolves when a token is available.

## Advanced Features

Some advanced features are still in development:

| Feature | Description | Purpose | Implementation |
|---------|-------------|---------|---------------|
| `retrySequence` | Multiple dependent steps with retry | For complex workflows | Execute array of steps sequentially |
| `rollbackOnFail` | Rollbacks for previous steps | Consistency during partial failures | Define `rollback()` per step |
| `customErrorTypes` | Custom error filters | Some errors shouldn't be retried | `retryIf: (err) => boolean` |
| `globalAbortSignal` | External AbortSignal | Integration with UI components | Pass signal to all calls |
| `pluginHooks` | Extensibility for monitoring etc. | Separation of concerns | Hook API for various events |

## Roadmap

Future development plans include:

- Retry decorator for methods (for cleaner services)
- Global configuration for multiple retry calls
- Better browser compatibility (for older browsers)
- Additional backoff strategies
- Enhanced monitoring and metrics

## Contributing

If you've found a bug, have an idea for a missing feature, or just want to improve the code, feel free to jump in. 

1. Fork the repo
2. Create a branch: git checkout -b your-thing
3. Make your changes (tests are always appreciated)
4. Push and open a pull request

Please make sure to update tests as appropriate and adhere to the existing coding style.

### Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Build the project (ESM and CommonJS formats)
npm run build

# Clean the build output
npm run clean

# Build only ESM format
npm run build:esm

# Build only CommonJS format
npm run build:cjs

# Lint the code
npm run lint

# Format the code
npm run format
```

### Examples

The repository includes an `examples` directory with sample implementations demonstrating the library's features. These examples are intended for local development and testing purposes and are not included in the published package.

To run an example:

```bash
# Navigate to the examples directory
cd examples

# Run a specific example with ts-node
npx ts-node basic-retry.ts
```

Available examples:
- **basic-retry.ts**: Demonstrates basic retry functionality
- **backoff-strategies.ts**: Shows different backoff strategies (constant, linear, exponential)
- **timeout-handling.ts**: Demonstrates timeout functionality
- **abort-signal.ts**: Shows how to use abort signals to cancel operations
- **rate-limiting.ts**: Demonstrates rate limiting functionality
- **combined-features.ts**: Shows how to combine multiple features together

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

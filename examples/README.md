# retryable-promise-ts Examples

This directory contains example implementations demonstrating the features of the `retryable-promise-ts` library. These examples are intended for local development and testing purposes.

## Purpose

- Demonstrate various features of the library
- Provide working code samples that can be run locally
- Serve as a testing ground for library functionality during development

## Note

These example files are excluded from the build process and are not included in the published package. They are intended solely for local development and testing.

## Running Examples

To run an example:

```bash
# Navigate to the examples directory
cd examples

# Run a specific example
npx tsx basic-retry.ts

# Or from the project root
npx tsx examples/basic-retry.ts
```

## Examples Overview

- **basic-retry.ts**: Demonstrates basic retry functionality
- **backoff-strategies.ts**: Shows different backoff strategies (constant, linear, exponential)
- **timeout-handling.ts**: Demonstrates timeout functionality
- **abort-signal.ts**: Shows how to use abort signals to cancel operations
- **rate-limiting.ts**: Demonstrates rate limiting functionality
- **combined-features.ts**: Shows how to combine multiple features together
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      exclude: [
        '**/examples/**',
        '**/node_modules/**',
        '**/dist/**',
        'eslint.config.js',
        'vitest.config.ts',
      ],
      thresholds: {
        lines: 99,
        functions: 100,
        branches: 98,
        statements: 99,
      },
    },
  },
});

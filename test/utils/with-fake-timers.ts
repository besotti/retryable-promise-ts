import { vi } from 'vitest';

export const withFakeTimers = (fn: () => Promise<void> | void) => async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(0));
  try {
    await fn();
  } finally {
    vi.useRealTimers();
  }
};

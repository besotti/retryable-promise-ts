export const delayMs = (ms: number) => new Promise<void>(res => setTimeout(res, Math.max(0, ms)));

import { retry, createBackoffDelayFn, NextDelayOverride } from '../src';

let counter = 0;

async function flakyApi(): Promise<string> {
  counter++;
  console.log(`Attempt ${counter}...`);
  throw new Error('Temporary failure');
}

const customOverride: NextDelayOverride<string> = async ctx => {
  console.log(`Default suggested delay: ${ctx.suggestedDelayMs}ms`);
  // Verdopple den Delay ab dem dritten Versuch
  return ctx.attempt >= 3 ? ctx.suggestedDelayMs * 2 : ctx.suggestedDelayMs;
};

async function main() {
  try {
    await retry(flakyApi, {
      retries: 5,
      delayFn: createBackoffDelayFn('constant', 500),
      nextDelayOverride: customOverride,
    });
  } catch (err) {
    console.error('Operation failed:', err);
  }
}

main();

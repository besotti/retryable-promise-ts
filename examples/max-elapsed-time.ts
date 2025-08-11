import { retry, createBackoffDelayFn } from '../src';

let counter = 0;

async function slowApi(): Promise<string> {
  counter++;
  console.log(`Attempt ${counter}...`);
  throw new Error('Still failing...');
}

async function main() {
  try {
    await retry(slowApi, {
      retries: 10,
      delayFn: createBackoffDelayFn('linear', 1000), // 1s, 2s, 3s...
      maxElapsedTime: 3500, // 3,5s
    });
  } catch (err) {
    console.error('Gave up due to maxElapsedTime:', err);
  }
}

main();

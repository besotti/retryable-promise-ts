import { retry } from '../src';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
let counter = 0;

async function getData(): Promise<number> {
  counter++;
  return Math.floor(Math.random() * 10); // 0..9
}

async function main() {
  const result = await retry(getData, {
    retries: 5,
    retryOnResult: async (value, attempt) => {
      console.log(`Got value: ${value} (Attempt ${attempt})`);
      return value < 7; // min 7 retries
    },
  });

  console.log(`Final value: ${result}`);
}

main().catch(console.error);

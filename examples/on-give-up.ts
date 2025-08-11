import { retry } from '../src';

let counter = 0;

async function alwaysFail(): Promise<string> {
  counter++;
  console.log(`Attempt ${counter} failing...`);
  throw new Error('Permanent failure');
}

async function main() {
  await retry(alwaysFail, {
    retries: 3,
    onRetry: (err, attempt) => {
      console.log(`Attempt ${attempt} failed: ${err.message}`);
    },
    onGiveUp: async (lastError, attempts) => {
      console.log(`Giving up after ${attempts} attempts. Last error:`, lastError);
    },
  });
}

main().catch(console.error);

import { retry } from '../src';

let counter = 0;

async function unstableApi(): Promise<string> {
  counter++;
  if (Math.random() < 0.5) throw new Error('NETWORK_ERROR');
  if (Math.random() < 0.5) throw new Error('VALIDATION_ERROR');
  return `Success on attempt ${counter}`;
}

async function main() {
  const result = await retry(unstableApi, {
    retries: 5,
    retryIf: err => {
      return err instanceof Error && err.message === 'NETWORK_ERROR';
    },
    onRetry: (err, attempt) => {
      console.log(`Retrying after error: ${err.message} (Attempt ${attempt})`);
    },
  });

  console.log(`Final result: ${result}`);
}

main().catch(console.error);

import { createInterface, type Interface } from 'node:readline/promises';

/**
 * Create a prompt wrapper using Node.js readline/promises.
 * Prompts are written to stderr (not stdout) to keep stdout clean for data output.
 *
 * @returns Object with `ask` function and `close` cleanup function.
 */
export function createPrompt(): { ask: (question: string) => Promise<string>; close: () => void } {
  const rl: Interface = createInterface({
    input: process.stdin,
    output: process.stderr,
  });

  return {
    ask: (question: string): Promise<string> => rl.question(question),
    close: (): void => rl.close(),
  };
}

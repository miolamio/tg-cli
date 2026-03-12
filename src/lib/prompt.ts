import { createInterface, type Interface } from 'node:readline/promises';
import { Writable } from 'node:stream';

/**
 * Create a prompt wrapper using Node.js readline/promises.
 * Prompts are written to stderr (not stdout) to keep stdout clean for data output.
 *
 * The output goes through a mutable proxy so that askSecret() can suppress
 * character echoing for password/secret input.
 *
 * @returns Object with `ask`, `askSecret`, and `close` functions.
 */
export function createPrompt(): {
  ask: (question: string) => Promise<string>;
  askSecret: (question: string) => Promise<string>;
  close: () => void;
} {
  let muted = false;
  const output = new Writable({
    write(chunk, encoding, callback) {
      if (!muted) process.stderr.write(chunk, encoding as BufferEncoding);
      callback();
    },
  });

  const rl: Interface = createInterface({
    input: process.stdin,
    output,
    terminal: true,
  });

  return {
    ask: (question: string): Promise<string> => rl.question(question),
    askSecret: async (question: string): Promise<string> => {
      process.stderr.write(question);
      muted = true;
      try {
        const answer = await rl.question('');
        return answer;
      } finally {
        muted = false;
        process.stderr.write('\n');
      }
    },
    close: (): void => rl.close(),
  };
}

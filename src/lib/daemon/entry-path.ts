import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Resolve the compiled daemon entry for `fork()`.
 *
 * After tsup, command code lives in `dist/bin/tg.js` (or a dist/ chunk).
 * The entry file is always `dist/lib/daemon/entry.js`. A path computed
 * as if we were still under `src/commands/daemon/` misses that file.
 *
 * Tries `import.meta.url` of the caller and `process.argv[1]` (the
 * running binary) against a few relative layouts; first existing path wins.
 */
export function resolveDaemonEntry(moduleUrl: string = import.meta.url): string {
  const bases: string[] = [];
  try {
    bases.push(dirname(fileURLToPath(moduleUrl)));
  } catch {
    // moduleUrl is not a file URL
  }
  if (process.argv[1]) {
    bases.push(dirname(process.argv[1]));
  }

  const relatives = [
    join('..', 'lib', 'daemon', 'entry.js'),      // dist/bin/tg.js
    join('lib', 'daemon', 'entry.js'),            // dist/chunk.js
    join('..', '..', 'lib', 'daemon', 'entry.js'), // src/commands/daemon (built colocated)
  ];

  const candidates: string[] = [];
  for (const base of bases) {
    for (const rel of relatives) {
      candidates.push(join(base, rel));
    }
  }

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }

  return candidates[0] ?? join('lib', 'daemon', 'entry.js');
}

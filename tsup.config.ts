import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'bin/tg': 'src/bin/tg.ts',
    'lib/daemon/entry': 'src/lib/daemon/entry.ts',
  },
  format: ['esm'],
  target: 'node20',
  clean: true,
  sourcemap: true,
  dts: false,
  shims: false,
  banner: {
    js: '#!/usr/bin/env node',
  },
  external: ['telegram'],
});

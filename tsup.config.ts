import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'bin/tg': 'src/bin/tg.ts',
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

import { defineConfig } from 'tsup';

const shared = {
  format: ['esm'] as const,
  target: 'node20' as const,
  sourcemap: true,
  shims: false,
  external: ['telegram'],
};

export default defineConfig([
  {
    ...shared,
    entry: { 'bin/tg': 'src/bin/tg.ts' },
    clean: true,
    dts: false,
    banner: { js: '#!/usr/bin/env node' },
  },
  {
    ...shared,
    entry: { 'lib/daemon/entry': 'src/lib/daemon/entry.ts' },
    clean: false,
    dts: false,
  },
  {
    ...shared,
    entry: { index: 'src/index.ts' },
    clean: false,
    dts: true,
  },
]);

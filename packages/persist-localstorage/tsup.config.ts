import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: { resolve: false },
    external: [
        '@oimdb/core',
        '@oimdb/core/*',
        '@oimdb/persist',
        '@oimdb/persist/*',
    ],
});

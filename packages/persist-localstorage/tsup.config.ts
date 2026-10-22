import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: { resolve: false },
    clean: true,
    external: ['@oimdb/core', '@oimdb/persist'],
});

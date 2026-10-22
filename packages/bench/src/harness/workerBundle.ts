import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// tsx compiles with keepNames, wrapping every closure in `__name`; a worker that prices ours must not pay that — `README.md#workerbundle`.
export const WORKER_BUNDLE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '.workers');

const bundledWorkerPaths = new Map<string, string>();

export const bundledWorkerPath = (workerEntryPath: string): string => {
    const cached = bundledWorkerPaths.get(workerEntryPath);
    if (cached !== undefined) return cached;
    const outfile = join(WORKER_BUNDLE_DIR, `${basename(workerEntryPath, '.ts')}.${process.pid}.mjs`);
    buildSync({
        entryPoints: [workerEntryPath],
        outfile,
        bundle: true,
        platform: 'node',
        format: 'esm',
        target: 'node24',
        packages: 'external',
        keepNames: false,
        logLevel: 'warning',
    });
    bundledWorkerPaths.set(workerEntryPath, outfile);
    process.once('exit', () => rmSync(outfile, { force: true }));
    return outfile;
};

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { bundledWorkerPath } from '../src/harness/workerBundle';

const src = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

describe('what a price worker runs', () => {
    for (const worker of ['price-worker.ts', 'retained-worker.ts']) {
        it(`bundles ${worker} with no __name wrapper around a closure`, () => {
            const bundled = readFileSync(bundledWorkerPath(join(src, worker)), 'utf8');
            assert.equal(bundled.includes('__name('), false);
        });
    }

    for (const runner of ['price/runPricePairs.ts', 'retained/runRetainedPairs.ts']) {
        it(`spawns the bundled worker from ${runner}, never one under tsx`, () => {
            const runnerSource = readFileSync(join(src, runner), 'utf8');
            assert.equal(runnerSource.includes("'tsx'"), false);
            assert.equal(runnerSource.includes('bundledWorkerPath(workerPath)'), true);
        });
    }
});

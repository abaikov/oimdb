import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { BenchPrices, BenchResults } from '../src/components/Bench/data';
import { HEADLINE_OPERATIONS, OPERATIONS, landingNumbersOf } from '../src/components/Landing/landingNumbers';

const dataDirectory = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'bench');
const readData = <TData>(file: string): TData => JSON.parse(readFileSync(join(dataDirectory, file), 'utf8')) as TData;

const MIN_STORIES = 3;

const landingNumbers = landingNumbersOf(readData<BenchResults>('results.json'), readData<BenchPrices>('prices.json'));

test('every headline price on the landing has a fresh measurement', () => {
    const shown = new Set(landingNumbers.headlineOperations.map(operation => operation.pairId));
    assert.deepEqual(HEADLINE_OPERATIONS.map(operation => operation.pairId).filter(pairId => !shown.has(pairId)), []);
});

test('every price card on the landing has a fresh measurement', () => {
    const shown = new Set(landingNumbers.operations.map(operation => operation.pairId));
    assert.deepEqual(OPERATIONS.map(operation => operation.pairId).filter(pairId => !shown.has(pairId)), []);
});

test(`the landing tells at least ${MIN_STORIES} stories with fresh rows on both sides`, () => {
    assert.ok(
        landingNumbers.stories.length >= MIN_STORIES,
        `${landingNumbers.stories.length} stories: the oimdb or the rival rows of the other scenarios are stale or missing`,
    );
});

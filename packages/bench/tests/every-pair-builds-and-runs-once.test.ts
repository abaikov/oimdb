import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PRICE_CATALOGUE_EXPORT_NAMES } from '../src/price/priceCatalogueExportNames';
import type { TPricePair } from '../src/price/TPricePair';
import { retainedPairs } from '../src/retained/retainedPairs';

describe('every pair builds and runs once', () => {
    for (const exportName of PRICE_CATALOGUE_EXPORT_NAMES) {
        it(`builds and runs both sides of every pair in ${exportName}`, async () => {
            const catalogueModule = (await import(`../src/price/${exportName}.ts`)) as Record<string, readonly TPricePair[] | undefined>;
            const catalogue = catalogueModule[exportName];
            assert.ok(catalogue !== undefined, `${exportName} exports no catalogue`);
            for (const pair of catalogue) {
                const { ours, floor } = pair.build('both');
                for (const side of [ours, floor]) {
                    side.reset();
                    side.run(1);
                }
            }
        });
    }

    it('builds both arms of every retained pair', () => {
        for (const pair of [...retainedPairs.controls, ...retainedPairs.measured]) {
            for (const arm of ['on', 'off'] as const) {
                assert.ok(pair.build(arm).rows >= 0, pair.id);
            }
        }
    });
});

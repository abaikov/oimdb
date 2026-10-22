import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pointOf } from '../src/cells/points';
import { scenarioTables } from '../src/cells/scenarioTables';
import type { TCellRecord, TCellStatus } from '../src/cells/types';

const measuredStatus = (adapter: string, ratio: number, drift: number, batchId: string): TCellStatus => {
    const record = {
        format: 2,
        key: { point: 'default', scenario: 'patchColumn', adapter },
        batch: {
            id: batchId,
            point: pointOf('default'),
            anchor: { name: 'baseline-array', min: 1, drift: 0.01 },
            resolution: { leanMin: 1, heavyMin: 2, gap: 1, drift: 0.02, resolved: true, fine: undefined },
            load: { cores: 8, gate: 0.5, selfAllowance: 3, start: 0, peak: 0, readings: 1, foreignPeak: 0, over: false },
            gcMissing: false,
        },
        outcome: {
            status: 'measured',
            min: ratio,
            processMins: [ratio],
            drift,
            lost: 0,
            spread: 0,
            repeat: 1,
            samples: 9,
            warmed: 5,
            a: { deliveries: 1, distinct: 1, redundant: 0 },
            b: { deliveries: 0, distinct: 0, redundant: 0 },
            ratioToAnchor: ratio,
        },
        measuredAt: '2026-10-16T00:00:00.000Z',
    } as unknown as TCellRecord;
    return { key: record.key, state: { status: 'fresh', record } };
};

const placesOf = (statuses: readonly TCellStatus[]): Record<string, number | undefined> =>
    Object.fromEntries(scenarioTables(statuses)[0].rows.map(row => [row.adapter, row.place]));

describe('what a table may rank', () => {
    it('orders rows by their ratio to the anchor of their own batch', () => {
        const rows = scenarioTables([
            measuredStatus('slow', 3, 0.01, 'b1'),
            measuredStatus('fast', 1, 0.01, 'b1'),
        ])[0].rows;
        assert.deepEqual(rows.map(row => row.adapter), ['fast', 'slow']);
    });

    it('withholds a place from a row the drift of either side cannot separate from the one above', () => {
        assert.deepEqual(
            placesOf([measuredStatus('a', 1, 0.05, 'b1'), measuredStatus('b', 1.03, 0.05, 'b1')]),
            { a: 1, b: undefined }
        );
    });

    it('asks more of two rows from different batches: their anchors drifted too', () => {
        const sameBatch = placesOf([measuredStatus('a', 1, 0.02, 'b1'), measuredStatus('b', 1.025, 0.02, 'b1')]);
        const twoBatches = placesOf([measuredStatus('a', 1, 0.02, 'b1'), measuredStatus('b', 1.025, 0.02, 'b2')]);
        assert.equal(sameBatch.b, 2);
        assert.equal(twoBatches.b, undefined);
    });
});

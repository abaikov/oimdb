import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { CellStore } from '../src/cells/cellStore';
import { cellStatuses } from '../src/cells/cellStatus';
import { CURRENT_ENVIRONMENT } from '../src/cells/environment';
import { pointOf } from '../src/cells/points';
import { qualityIssuesOf } from '../src/cells/quality';
import { planBatches } from '../src/cells/selectBatches';
import type { TCellRecord, TFingerprint } from '../src/cells/types';

const FINGERPRINT: TFingerprint = { harness: 'h1', adapter: 'a1', subject: 's1', libraries: { mobx: '6.16.1' } };

const fingerprintSourceOf = (fingerprint: TFingerprint) => ({
    fingerprintOf: () => Promise.resolve(fingerprint),
    harnessDigest: () => Promise.resolve(fingerprint.harness),
});

const PLAN = { repeat: 4, samples: 9, warmup: 10 };

const recordFor = (adapter: string, fingerprint: TFingerprint, seconds = 50): TCellRecord => {
    const point = pointOf('small');
    return {
        format: 2,
        key: { point: 'small', scenario: 'patchNote', adapter },
        fingerprint,
        environment: CURRENT_ENVIRONMENT,
        plan: PLAN,
        batch: {
            id: 'b1',
            point,
            scenario: 'patchNote',
            adapterNames: ['control-lean', 'control-heavy', 'baseline-array', adapter],
            startedAt: '2026-10-16T00:00:00.000Z',
            seconds,
            load: { cores: 8, gate: 0.5, selfAllowance: 2, start: 0.1, peak: 0.2, readings: 5, foreignPeak: 0, over: false },
            gcMissing: false,
            resolution: { leanMin: 1, heavyMin: 2, gap: 1, drift: 0.05, resolved: true, fine: undefined },
            anchor: { name: 'baseline-array', min: 1, drift: 0.02 },
        },
        outcome: {
            status: 'measured',
            min: 0.5,
            processMins: [0.5, 0.52],
            drift: 0.04,
            lost: 0,
            spread: 0.1,
            repeat: 4,
            samples: 9,
            warmed: 10,
            a: { deliveries: 32, distinct: 0, redundant: 32 },
            b: { deliveries: 0, distinct: 0, redundant: 0 },
            ratioToAnchor: 0.5,
        },
        measuredAt: '2026-10-16T00:00:00.000Z',
    };
};

const storeWithPlan = () => {
    const store = new CellStore(mkdtempSync(join(tmpdir(), 'bench-cells-')));
    store.savePlan({
        format: 2,
        point: pointOf('small'),
        scenario: 'patchNote',
        plan: PLAN,
        probes: [],
        probeFailures: [],
        probedAt: '2026-10-16T00:00:00.000Z',
        harness: 'h1',
    });
    return store;
};

const filter = { points: ['small'], scenarios: ['patchNote'], adapters: ['mobx'] };

describe('what a cell is due for', () => {
    it('calls a cell with no record missing', async () => {
        const [status] = await cellStatuses(storeWithPlan(), fingerprintSourceOf(FINGERPRINT), filter);
        assert.equal(status.state.status, 'missing');
    });

    it('calls a cell fresh only while every part of its fingerprint and its plan still hold', async () => {
        const store = storeWithPlan();
        store.saveCells([recordFor('mobx', FINGERPRINT)]);
        const [fresh] = await cellStatuses(store, fingerprintSourceOf(FINGERPRINT), filter);
        assert.equal(fresh.state.status, 'fresh');

        const moved = { ...FINGERPRINT, adapter: 'a2', libraries: { mobx: '6.17.0' } };
        const [stale] = await cellStatuses(store, fingerprintSourceOf(moved), filter);
        assert.equal(stale.state.status, 'stale');
        assert.deepEqual(stale.state.status === 'stale' ? stale.state.reasons : [], ['adapter', 'library']);
    });

    it('names a re-calibrated plan as the reason a cell went stale', async () => {
        const store = storeWithPlan();
        store.saveCells([recordFor('mobx', FINGERPRINT)]);
        store.forgetPlan('small', 'patchNote');
        const [stale] = await cellStatuses(store, fingerprintSourceOf(FINGERPRINT), filter);
        assert.deepEqual(stale.state.status === 'stale' ? stale.state.reasons : [], ['plan']);
    });

    it('never counts a declined wiring as work', async () => {
        const statuses = await cellStatuses(storeWithPlan(), fingerprintSourceOf(FINGERPRINT), {
            points: ['small'],
            scenarios: ['churnColumn'],
            adapters: ['lokijs'],
        });
        assert.equal(statuses[0].state.status, 'declined');
        assert.deepEqual(planBatches(statuses, storeWithPlan(), Number.POSITIVE_INFINITY, 'due'), []);
    });
});

describe('what a budget buys', () => {
    it('packs one scenario into one batch and charges the controls and the anchor to it', async () => {
        const store = storeWithPlan();
        const statuses = await cellStatuses(store, fingerprintSourceOf(FINGERPRINT), {
            points: ['small'],
            scenarios: ['patchNote'],
            adapters: ['mobx', 'jotai'],
        });
        const [batch, ...rest] = planBatches(statuses, store, Number.POSITIVE_INFINITY, 'due');
        assert.deepEqual(rest, []);
        assert.deepEqual(batch.adapterNames, ['mobx', 'jotai']);
        assert.ok(batch.estimatedSeconds > 0);
    });

    it('stops adding cells at the budget but always runs at least one', async () => {
        const store = storeWithPlan();
        const statuses = await cellStatuses(store, fingerprintSourceOf(FINGERPRINT), {
            points: ['small'],
            scenarios: ['patchNote', 'patchColumn'],
            adapters: ['mobx', 'jotai'],
        });
        const batches = planBatches(statuses, store, 1, 'due');
        assert.equal(batches.length, 1);
        assert.deepEqual(batches[0].adapterNames, ['mobx']);
    });

    it('keeps a cell taken with fewer processes fresh, flags it shallow, and deepens it on retry', async () => {
        const store = storeWithPlan();
        const record = recordFor('mobx', FINGERPRINT);
        store.saveCells([{ ...record, batch: { ...record.batch, point: { ...record.batch.point, processes: 1 } } }]);
        const statuses = await cellStatuses(store, fingerprintSourceOf(FINGERPRINT), filter);
        assert.equal(statuses[0].state.status, 'fresh');
        assert.deepEqual(
            statuses[0].state.status === 'fresh' ? qualityIssuesOf(statuses[0].state.record, false) : [],
            ['shallow']
        );
        assert.deepEqual(planBatches(statuses, store, Number.POSITIVE_INFINITY, 'due'), []);
        const [deepened] = planBatches(statuses, store, Number.POSITIVE_INFINITY, 'due-and-failed');
        assert.equal(deepened.point.processes, pointOf('small').processes);
    });

    it('runs every batch at the processes it is told to', async () => {
        const store = storeWithPlan();
        const statuses = await cellStatuses(store, fingerprintSourceOf(FINGERPRINT), filter);
        const [batch] = planBatches(statuses, store, Number.POSITIVE_INFINITY, 'due', 1);
        assert.equal(batch.point.processes, 1);
    });

    it('prices a cell from the batch that last measured it', async () => {
        const store = storeWithPlan();
        store.saveCells([recordFor('mobx', FINGERPRINT, 400)]);
        const statuses = await cellStatuses(store, fingerprintSourceOf(FINGERPRINT), filter);
        const [batch] = planBatches(statuses, store, Number.POSITIVE_INFINITY, 'all');
        assert.ok(batch.estimatedSeconds >= 400 / 4);
    });
});

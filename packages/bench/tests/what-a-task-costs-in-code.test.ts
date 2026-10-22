import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ADAPTERS } from '../src/harness/registry';
import { CHURN_SHAPES, READ_SHAPES } from '../src/harness/types';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { participantCodeVolumes } from '../src/lines/participantCodeVolume';
import { wiringCodeVolume } from '../src/lines/wiringCodeVolume';

const volumes = participantCodeVolumes();

const FIXTURE = `
const actions = { patch: (value: number): number => value + 1 };
const rowOnly = (value: number): number => {
    const doubled = value * 2;
    return doubled;
};
const chainOnly = (value: number): number => {
    const first = value + 1;
    const second = first + 2;
    const third = second + 3;
    return third;
};
const store = { actions: { patch: (value: number): number => value } };
export const fixtureAdapter = {
    bind: () => store.actions.patch(
        1
    ),
    churn: () => ({
        mountOnRows: (at: number) => rowOnly(
            at
        ),
        mountOnChain: (at: number) => chainOnly(
            at
        ),
    }),
    reads: () => 0,
};
`;

const fixtureFile = (text: string): string => {
    const file = join(mkdtempSync(join(tmpdir(), 'bench-lines-')), 'fixture.ts');
    writeFileSync(file, text);
    return file;
};

describe('what a task costs in code', () => {
    it('gives every participant a figure for every wiring it supplies, and none for one it declines', () => {
        for (const adapter of ADAPTERS) {
            const volume = volumes.find(entry => entry.participant === adapter.name);
            assert.ok(volume !== undefined, adapter.name);
            const has = (shape: string): boolean => volume.shapes.some(entry => entry.shape === shape);
            assert.ok(has('bind'), `${adapter.name}: bind`);
            for (const shape of CHURN_SHAPES) {
                assert.equal(has(`churn.${shape}`), adapter.churn[shape].build !== undefined, `${adapter.name}: churn.${shape}`);
            }
            for (const shape of READ_SHAPES) {
                assert.equal(has(`reads.${shape}`), adapter.reads[shape].build !== undefined, `${adapter.name}: reads.${shape}`);
            }
            assert.equal(has('relations'), adapter.relations.build !== undefined, `${adapter.name}: relations`);
            assert.equal(has('single'), adapter.single.build !== undefined, `${adapter.name}: single`);
        }
    });

    it('does not charge a shape for the mount another shape needs', () => {
        const shapes = wiringCodeVolume(fixtureFile(FIXTURE));
        const row = shapes.find(entry => entry.shape === 'churn.row');
        const chain = shapes.find(entry => entry.shape === 'churn.chain');
        assert.ok(row !== undefined && chain !== undefined);
        assert.ok(row.declarations.includes('rowOnly') && !row.declarations.includes('chainOnly'));
        assert.ok(chain.declarations.includes('chainOnly') && !chain.declarations.includes('rowOnly'));
    });

    it('charges a property name as no reference to the declaration it happens to share a name with', () => {
        const bind = wiringCodeVolume(fixtureFile(FIXTURE)).find(entry => entry.shape === 'bind');
        assert.ok(bind !== undefined && !bind.declarations.includes('actions'));
    });

    it('counts the same code the same however it is laid out', () => {
        const spread = wiringCodeVolume(fixtureFile(FIXTURE));
        const joined = wiringCodeVolume(fixtureFile(FIXTURE.replace(/\n\s+(?=[a-zA-Z)}])/g, ' ')));
        assert.deepEqual(
            joined.map(entry => [entry.shape, entry.codeLines]),
            spread.map(entry => [entry.shape, entry.codeLines])
        );
    });

    it('counts real code, never a string field', () => {
        for (const volume of volumes) {
            for (const entry of volume.shapes) assert.ok(entry.codeLines > 10, `${volume.participant}: ${entry.shape}`);
        }
    });
});

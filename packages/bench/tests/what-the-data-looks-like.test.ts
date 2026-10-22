import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { makeRows, onSecondAxis, ownerOf } from '../src/harness/dataset';

const ROWS = makeRows(10_000);

describe('what the data looks like', () => {
    it('gives every row a distinct id, label and note', () => {
        assert.equal(new Set(ROWS.map(row => row.id)).size, ROWS.length);
        assert.equal(new Set(ROWS.map(row => row.label)).size, ROWS.length);
        assert.equal(new Set(ROWS.map(row => row.note)).size, ROWS.length);
    });

    it('makes every id, label and note the same length', () => {
        const lengths = new Set(ROWS.flatMap(row => [row.id.length, row.label.length, row.note.length]));
        assert.deepEqual([...lengths], [8]);
    });

    it('does not hand ids over in sorted order', () => {
        const ids = ROWS.map(row => row.id);
        const sorted = [...ids].sort();
        assert.notDeepEqual(ids, sorted);
        assert.notEqual(ids[0].slice(1, 5), ids[1].slice(1, 5));
    });

    it('keeps the second axis on the hundreds digit of the row number, as the stores query it', () => {
        for (let i = 0; i < ROWS.length; i++) {
            assert.equal(onSecondAxis(ROWS[i].id), Math.floor(i / 100) % 2 === 0);
            assert.equal(onSecondAxis(ROWS[i].id), /[02468][0-9][0-9]$/.test(ROWS[i].id));
        }
    });

    it('keeps rows k and k + 100 on the same owner', () => {
        for (let k = 0; k < 100; k++) assert.equal(ownerOf(ROWS[k].id), ownerOf(ROWS[100 + k].id));
    });

    it('builds the same data every time', () => {
        assert.deepEqual(makeRows(10_000), ROWS);
    });
});

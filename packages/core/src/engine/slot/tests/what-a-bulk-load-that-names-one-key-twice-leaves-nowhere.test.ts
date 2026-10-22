import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { oimIsSlotEmpty } from '../utils/oimIsSlotEmpty';
import { oimIsSlotReleased } from '../utils/oimIsSlotReleased';

type TRow = { id: string; n: number };

const createFixture = () => {
    const db = new OIMDB();
    const rowsService = createOIMEntityService<TRow>(db, { keyOf: row => row.id });
    const rows = rowsService.createStoreSlot(db);
    return { db, rowsService, rows };
};

type TRowsService = ReturnType<typeof createFixture>['rowsService'];
type TRowsStoreSlot = ReturnType<typeof createFixture>['rows'];

const idsOfNonEmptyRows = (rowsService: TRowsService, rows: TRowsStoreSlot): (string | undefined)[] =>
    [...rowsService.getSlots(rows)].filter(slot => !oimIsSlotEmpty(slot)).map(slot => slot.entity?.id);

const refusedLoad = (rowsService: TRowsService, rows: TRowsStoreSlot, pairs: readonly TRow[]): void => {
    try {
        rowsService.slotContentService.insertEntities(rows, pairs);
    } catch {
        return;
    }
    throw new Error('this load was supposed to be refused');
};

describe('a bulk load that names one key twice', () => {
    it('leaves no non-empty row behind, and no way to reach what it minted', () => {
        const { rowsService, rows } = createFixture();

        expect(() => {
            rowsService.slotContentService.insertEntities(rows, [{ id: 'u1', n: 1 }, { id: 'u1', n: 2 }]);
        }).toThrow('name one key more than once');

        expect(rowsService.getSlotCount(rows)).toBe(0);
        expect(idsOfNonEmptyRows(rowsService, rows)).toEqual([]);
    });

    it('leaves the rows named before the repeat nowhere either', () => {
        const { db, rowsService, rows } = createFixture();

        expect(() => {
            rowsService.slotContentService.insertEntities(rows, [{ id: 'a', n: 1 }, { id: 'b', n: 2 }, { id: 'a', n: 3 }]);
        }).toThrow('name one key more than once');

        expect(rowsService.getSlotCount(rows)).toBe(0);
        expect(idsOfNonEmptyRows(rowsService, rows)).toEqual([]);
        expect(rowsService.getSlotByKey(rows, 'b').entity).toBeUndefined();
        expect(rowsService.getSlotCount(rows)).toBe(1);
        db.flush();
        expect(rowsService.getSlotCount(rows)).toBe(0);
    });

    it('does not let a later write be unfiled by the identity the repeat displaced', () => {
        const { rowsService, rows } = createFixture();
        refusedLoad(rowsService, rows, [{ id: 'u1', n: 1 }, { id: 'u1', n: 2 }]);

        const live = rowsService.slotContentService.upsertEntity(rows, { id: 'u1', n: 9 });
        for (const stranded of [...rowsService.getSlots(rows)]) {
            if (stranded !== live) rowsService.slotContentService.deleteEntity(stranded);
        }

        expect(rowsService.getSlotByKey(rows, 'u1') === live).toBe(true);
        expect(oimIsSlotReleased(live)).toBe(false);
        expect(idsOfNonEmptyRows(rowsService, rows)).toEqual(['u1']);
    });

    it('refuses a key the store already holds and leaves the rows that were there before the call', () => {
        const { db, rowsService, rows } = createFixture();
        rowsService.slotContentService.insertEntities(rows, [{ id: 'a', n: 1 }, { id: 'b', n: 2 }]);
        db.flush();

        expect(() => {
            rowsService.slotContentService.insertEntities(rows, [{ id: 'c', n: 3 }, { id: 'a', n: 4 }]);
        }).toThrow();

        expect(rowsService.getSlotByKey(rows, 'a').entity).toEqual({ id: 'a', n: 1 });
        expect(rowsService.getSlotByKey(rows, 'b').entity).toEqual({ id: 'b', n: 2 });
        expect(rowsService.slotContentService.findEntityByKey(rows, 'c')).toBeUndefined();
        expect(idsOfNonEmptyRows(rowsService, rows).sort()).toEqual(['a', 'b']);
    });

    it('still loads a bulk of distinct keys', () => {
        const { rowsService, rows } = createFixture();

        rowsService.slotContentService.insertEntities(rows, [{ id: 'a', n: 1 }, { id: 'b', n: 2 }]);

        expect(rowsService.getSlotCount(rows)).toBe(2);
        expect(rowsService.getSlotByKey(rows, 'a')?.entity?.n).toBe(1);
        expect(rowsService.getSlotByKey(rows, 'b')?.entity?.n).toBe(2);
    });
});

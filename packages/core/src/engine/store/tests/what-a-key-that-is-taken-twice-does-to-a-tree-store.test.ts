import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { OIMKeyTreeWalkScalar } from '../../key/OIMKeyTreeWalkScalar';
import { OIMSlotStoreServiceTreeDriven } from '../OIMSlotStoreServiceTreeDriven';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMEntityColumnName } from '../../entity/types/TOIMEntityColumnName';
import type { TOIMStoreKey } from '../types/TOIMStoreKey';
import type { TOIMSlotStoreTree } from '../types/TOIMSlotStoreTree';
import { oimIsSlotReleased } from '../../slot/utils/oimIsSlotReleased';

type TRow = { userId: string; day: string; note: string };
type TRowSlot = TOIMEntitySlot<TRow, readonly TOIMStoreKey[]>;
type TRowStore = TOIMSlotStoreTree<TRowSlot, TOIMStoreKey>;

const createFixture =() => {
    const db = new OIMDB();
    const rowsService = createOIMEntityService<TRow, TOIMEntityColumnName<TRow>, readonly TOIMStoreKey[], TRowStore>(db, {
        entitySlotStoreService: new OIMSlotStoreServiceTreeDriven<TOIMStoreKey, TRowSlot>(new OIMKeyTreeWalkScalar()),
        keyOf: (row: TRow) => [row.userId, row.day],
    });
    const rows = rowsService.createStoreSlot(db);
    return { db, rowsService, rows };
};

describe('a key a bulk load names twice, on a store keyed by a chain', () => {
    it('is refused, exactly as the map-keyed store refuses it', () => {
        const { db, rowsService, rows } = createFixture();

        expect(() => {
            rowsService.slotContentService.insertEntities(rows, [
                { userId: 'u1', day: 'mon', note: 'first' },
                { userId: 'u1', day: 'mon', note: 'second' },
            ]);
        }).toThrow('name one key more than once');

        expect(rowsService.getSlotCount(rows)).toBe(0);
        expect(rowsService.getSlotByKey(rows, ['u1', 'mon']).entity).toBeUndefined();
        expect(rowsService.getSlotCount(rows)).toBe(1);
        db.flush();
        expect(rowsService.getSlotCount(rows)).toBe(0);
    });

    it('counts what a key resolves to, so the store never holds an identity no key names', () => {
        const { rowsService, rows } = createFixture();

        rowsService.slotContentService.insertEntities(rows, [
            { userId: 'u1', day: 'mon', note: 'first' },
            { userId: 'u1', day: 'tue', note: 'second' },
        ]);

        expect(rowsService.getSlotCount(rows)).toBe(2);
        for (const slot of rowsService.getSlots(rows)) expect(rowsService.getSlotByKey(rows, slot.key)).toBe(slot);
    });

    it('empties through removeAll without handing a released identity back', () => {
        const { rowsService, rows } = createFixture();
        rowsService.slotContentService.insertEntities(rows, [
            { userId: 'u1', day: 'mon', note: 'first' },
            { userId: 'u2', day: 'mon', note: 'second' },
        ]);

        rowsService.slotContentService.clearAllEntities(rows);

        expect(rowsService.getSlotCount(rows)).toBe(0);
        expect([...rowsService.getSlots(rows)]).toHaveLength(0);
    });

    it('declines a release asked about an identity its key no longer names', () => {
        const { rowsService, rows } = createFixture();
        rowsService.slotContentService.insertEntities(rows, [{ userId: 'u1', day: 'mon', note: 'first' }]);
        const stale = rowsService.getSlotByKey(rows, ['u1', 'mon']);
        rowsService.slotContentService.deleteEntity(stale);
        expect(oimIsSlotReleased(stale)).toBe(true);

        const live = rowsService.holdSlotByKey(rows, ['u1', 'mon']);
        stale.owner.releaseSlotIfUnheld(stale);

        expect(oimIsSlotReleased(live)).toBe(false);
        expect(rowsService.getSlotByKey(rows, ['u1', 'mon'])).toBe(live);
        live.owner.unholdSlot(live);
    });
});

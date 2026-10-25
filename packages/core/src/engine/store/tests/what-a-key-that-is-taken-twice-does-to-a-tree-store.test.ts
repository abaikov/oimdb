import { OIMDB } from '../../../factories/OIMDB';
import { OIMScalarKeyTreeWalk } from '../../key/OIMScalarKeyTreeWalk';
import { OIMSlotTreeStoreService } from '../OIMSlotTreeStoreService';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../types/TOIMStoreKey';
import { oimIsSlotReleased } from '../../slot/utils/oimIsSlotReleased';
import { createOIMSlotContentEntityService } from '../../../factories/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../../factories/createOIMSlotCollectionService';

type TRow = { userId: string; day: string; note: string };
type TRowSlot = TOIMEntitySlot<TRow, readonly TOIMStoreKey[]>;

const createFixture =() => {
    const db = new OIMDB();
    const rowsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TRow, readonly TOIMStoreKey[]>(db), slotStoreService: new OIMSlotTreeStoreService<TOIMStoreKey, TRowSlot>(new OIMScalarKeyTreeWalk()) });
    const rows = rowsService.createStoreSlot(db);
    return { db, rowsService, rows };
};

describe('a key taken twice, on a store keyed by a chain', () => {
    it('counts what a key resolves to, so the store never holds an identity no key names', () => {
        const { rowsService, rows } = createFixture();

        rowsService.writeInBatch(rows, () => ([
            { userId: 'u1', day: 'mon', note: 'first' },
            { userId: 'u1', day: 'tue', note: 'second' },
        ]).map(entity => rowsService.writeSlotContentByKey(rows, ((row: TRow) => [row.userId, row.day])(entity), entity)));

        expect(rowsService.getSlotCount(rows)).toBe(2);
        for (const slot of rowsService.getSlots(rows)) expect(rowsService.getSlotByKey(rows, slot.key)).toBe(slot);
    });

    it('empties through removeAll without handing a released identity back', () => {
        const { rowsService, rows } = createFixture();
        rowsService.writeInBatch(rows, () => ([
            { userId: 'u1', day: 'mon', note: 'first' },
            { userId: 'u2', day: 'mon', note: 'second' },
        ]).map(entity => rowsService.writeSlotContentByKey(rows, ((row: TRow) => [row.userId, row.day])(entity), entity)));

        rowsService.writeInBatch(rows, () => { for (const entitySlot of [...rowsService.getSlots(rows)]) rowsService.slotContentService.clearSlotContent(entitySlot); });

        expect(rowsService.getSlotCount(rows)).toBe(0);
        expect([...rowsService.getSlots(rows)]).toHaveLength(0);
    });

    it('declines a release asked about an identity its key no longer names', () => {
        const { rowsService, rows } = createFixture();
        rowsService.writeInBatch(rows, () => ([{ userId: 'u1', day: 'mon', note: 'first' }]).map(entity => rowsService.writeSlotContentByKey(rows, ((row: TRow) => [row.userId, row.day])(entity), entity)));
        const stale = rowsService.getSlotByKey(rows, ['u1', 'mon']);
        rowsService.slotContentService.clearSlotContent(stale);
        expect(oimIsSlotReleased(stale)).toBe(true);

        const live = rowsService.holdSlotByKey(rows, ['u1', 'mon']);
        stale.owner.releaseSlotIfUnheld(stale);

        expect(oimIsSlotReleased(live)).toBe(false);
        expect(rowsService.getSlotByKey(rows, ['u1', 'mon'])).toBe(live);
        live.owner.unholdSlot(live);
    });
});

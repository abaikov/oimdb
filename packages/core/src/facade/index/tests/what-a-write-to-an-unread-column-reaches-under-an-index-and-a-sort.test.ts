import {
    OIMDB, OIMEffectService, OIMSlotContentBucketServiceSetDriven,
    createOIMComputedServiceSorted, createOIMEntityService, createOIMIndexService,
} from '../../../index';
import type { TOIMBucketSlotsSetStore, TOIMEntityColumnName, TOIMEntitySlot, TOIMStoreKey } from '../../../index';

type TRow = { id: string; group: string; rank: number; label: string; note: string };
type TRowSlot = TOIMEntitySlot<TRow>;

const createFixture = () => {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const rowsService = createOIMEntityService<TRow>(db, { keyOf: row => row.id });
    const rows = rowsService.createStoreSlot(db);
    for (let i = 0; i < 10; i++) rowsService.slotContentService.upsertEntity(rows, { id: `e${i}`, group: `g${i % 3}`, rank: i, label: `l${i}`, note: '' });
    const byGroupService = createOIMIndexService<
        TRow, TOIMStoreKey, readonly ['group'], string, Map<TOIMStoreKey, TOIMEntitySlot<TRow, TOIMStoreKey>>,
        TOIMBucketSlotsSetStore<TRowSlot>, OIMSlotContentBucketServiceSetDriven<TRowSlot>
    >(db, {
        entityService: rowsService,
        slotContentService: new OIMSlotContentBucketServiceSetDriven<TRowSlot>(),
        columns: ['group'],
    });
    const byGroup = byGroupService.createIndexStoreSlot(rows);
    const ordersService = createOIMComputedServiceSorted({
        indexService: byGroupService,
        sortColumns: [{ column: 'rank', direction: 'asc' }, { column: 'id', direction: 'asc' }],
    });
    const orders = ordersService.createSortedStoreSlot(byGroup);
    const order = ordersService.computedCollectionService.holdSlotByKey(orders, 'g1');
    effectService.createEffect(db, [], [order], () => undefined);
    const slot = rowsService.getSlotByKey(rows, 'e4');
    const groupSlot = rowsService.holdColumnGroup(slot, rowsService.getColumnGroup(['rank', 'label'] as TOIMEntityColumnName<TRow>[]));
    effectService.createEffect(db, [groupSlot], [], () => undefined);
    db.flush();
    const listenerCalls: string[] = [];
    const listeners = (rows as unknown as { contentChangeListeners: { onContentChanged: () => void; onContentChangedMany: () => void }[] })
        .contentChangeListeners;
    for (const listener of listeners) {
        const onContentChanged = listener.onContentChanged;
        const onContentChangedMany = listener.onContentChangedMany;
        listener.onContentChanged = (...args: unknown[]) => { listenerCalls.push('one'); (onContentChanged as (...a: unknown[]) => void)(...args); };
        listener.onContentChangedMany = (...args: unknown[]) => { listenerCalls.push('many'); (onContentChangedMany as (...a: unknown[]) => void)(...args); };
    }
    return { db, rowsService, rows, listenerCalls };
};

describe('a write to a column neither the index nor the sort reads', () => {
    it('reaches no content-change listener', () => {
        const { db, rowsService, rows, listenerCalls } = createFixture();

        rowsService.slotContentService.updateEntity(rowsService.getSlotByKey(rows, 'e4'), { note: 'n1' });
        db.flush();

        expect(listenerCalls).toEqual([]);
    });

    it('while a write to the sort column still reaches the index', () => {
        const { db, rowsService, rows, listenerCalls } = createFixture();

        rowsService.slotContentService.updateEntity(rowsService.getSlotByKey(rows, 'e4'), { rank: 99 });
        db.flush();

        expect(listenerCalls).toEqual(['one']);
    });
});

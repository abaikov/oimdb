import { OIMDB, OIMEffectService, OIMSetBucketContentService, createOIMSortedComputedService, createOIMSlotCollectionIndexService } from '../../index';
import type { TOIMBucketSlotsSetStore, TOIMColumnName, TOIMEntitySlot, TOIMStoreKey } from '../../index';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';

import { createOIMColumnGroup } from '../../column/utils/createOIMColumnGroup';

type TRow = { id: string; group: string; rank: number; label: string; note: string };
type TRowSlot = TOIMEntitySlot<TRow, TOIMStoreKey>;

const rankAndLabel = createOIMColumnGroup<TOIMColumnName<TRow>>(['rank', 'label']);

const createFixture = () => {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const rowsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TRow>(), columnGroups: [rankAndLabel] });
    const rows = rowsService.createStoreSlot(db);
    for (let i = 0; i < 10; i++) rowsService.writeSlotContentByKey(rows, `e${i}`, { id: `e${i}`, group: `g${i % 3}`, rank: i, label: `l${i}`, note: '' });
    const byGroupService = createOIMSlotCollectionIndexService<
        TRow, TOIMStoreKey, readonly ['group'], string, Map<TOIMStoreKey, TOIMEntitySlot<TRow, TOIMStoreKey>>,
        TOIMBucketSlotsSetStore<TRowSlot>, OIMSetBucketContentService<TRowSlot, string>
    >({
        entityService: rowsService,
        slotContentService: new OIMSetBucketContentService<TRowSlot, string>(),
        columns: ['group'],
    });
    const byGroup = byGroupService.createIndexStoreSlot(rows);
    const ordersService = createOIMSortedComputedService({
        indexService: byGroupService,
        sortColumns: [{ columnName: 'rank', direction: 'asc' }, { columnName: 'id', direction: 'asc' }],
    });
    const orders = ordersService.createSortedStoreSlot(byGroup);
    const order = ordersService.holdSlotByKey(orders, 'g1');
    effectService.createEffect(db, () => undefined, [], [order]);
    const slot = rowsService.getSlotByKey(rows, 'e4');
    const groupSlot = rowsService.columnSlotService.holdColumnGroupSlot(slot, rankAndLabel);
    effectService.createEffect(db, () => undefined, [groupSlot]);
    db.flush();
    const listenerCalls: string[] = [];
    const listeners = (rows as unknown as { contentChangeListeners: { onContentChanged: () => void; onManyContentsChanged: () => void }[] })
        .contentChangeListeners;
    for (const listener of listeners) {
        const onContentChanged = listener.onContentChanged;
        const onManyContentsChanged = listener.onManyContentsChanged;
        listener.onContentChanged = (...args: unknown[]) => { listenerCalls.push('one'); (onContentChanged as (...a: unknown[]) => void)(...args); };
        listener.onManyContentsChanged = (...args: unknown[]) => { listenerCalls.push('many'); (onManyContentsChanged as (...a: unknown[]) => void)(...args); };
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

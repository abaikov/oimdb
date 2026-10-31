import { createOIMSortedComputedService } from '@oimdb/core';
import type { OIMSlotCollectionIndexService, TOIMBucketSlotsArrayStore, TOIMEntitySlot, TOIMSlotCollectionIndexServiceStoreSlot, TOIMSortColumn, TOIMStoreKey } from '@oimdb/core';
import type { OIMEntityIndex } from './OIMEntityIndex';
import { OIMSortedEntityIndex } from './OIMSortedEntityIndex';

type TEntityIndexSlots<TEntity extends object> = TOIMBucketSlotsArrayStore<TOIMEntitySlot<TEntity>>;
type TEntityIndexSourceStore<TEntity extends object> = Map<TOIMStoreKey, TOIMEntitySlot<TEntity, TOIMStoreKey>>;

export function sorted<TEntity extends object, TKey extends NonNullable<unknown>>(
    entityIndex: OIMEntityIndex<TEntity, TKey, { getSlotByKey(key: TKey): { getBucketMemberSlots(): Iterable<TOIMEntitySlot<TEntity>>; getBucketMemberSlotCount(): number }; slotService: unknown; storeSlot: unknown }>,
    sortColumns: readonly TOIMSortColumn<TEntity>[],
) {
    const indexStoreAggregate = entityIndex.indexStoreAggregate;
    const sortedComputedService = createOIMSortedComputedService<TKey, TEntity, TEntityIndexSlots<TEntity>, TOIMStoreKey, TEntityIndexSourceStore<TEntity>>({
        indexService: indexStoreAggregate.slotService as OIMSlotCollectionIndexService<TKey, TEntity, TEntityIndexSlots<TEntity>, TOIMStoreKey, TEntityIndexSourceStore<TEntity>>,
        sortColumns,
    });
    return new OIMSortedEntityIndex<TEntity, TKey, typeof sortedComputedService, ReturnType<typeof sortedComputedService.createSortedStoreSlot>>(
        sortedComputedService,
        sortedComputedService.createSortedStoreSlot(
            indexStoreAggregate.storeSlot as TOIMSlotCollectionIndexServiceStoreSlot<TKey, TEntity, TEntityIndexSlots<TEntity>, TOIMStoreKey, TEntityIndexSourceStore<TEntity>>,
        ),
    );
}

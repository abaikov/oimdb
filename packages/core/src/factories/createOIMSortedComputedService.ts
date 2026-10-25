import type { IOIMSlotReleasePolicy } from '../engine/collector/interfaces/IOIMSlotReleasePolicy';
import type { IOIMSlotStoreService } from '../engine/store/interfaces/IOIMSlotStoreService';
import type { TOIMComputedColumnSlot } from '../engine/column/types/TOIMComputedColumnSlot';
import type { TOIMComputedSlot } from '../engine/computed/types/TOIMComputedSlot';
import type { TOIMEntitySlot } from '../engine/entity/types/TOIMEntitySlot';
import type { TOIMDefaultSlotStore } from '../engine/store/types/TOIMDefaultSlotStore';
import type { OIMSlotCollectionIndexService } from '../facade/index/OIMSlotCollectionIndexService';
import type { TOIMSortColumn } from '../facade/computed/types/TOIMSortColumn';
import { OIMSlotAtUnholdReleasePolicy } from '../engine/collector/OIMSlotAtUnholdReleasePolicy';
import { OIMSortedComputedService } from '../facade/computed/OIMSortedComputedService';
import { OIM_DEFAULT_COMPUTED_COLUMN_SLOT_STORE_SERVICE } from './defaults/OIM_DEFAULT_COMPUTED_COLUMN_SLOT_STORE_SERVICE';
import { OIM_DEFAULT_STORE_SLOT_LISTENER } from './defaults/OIM_DEFAULT_STORE_SLOT_LISTENER';
import { oimSlotStoreServiceWithDefault } from './utils/oimSlotStoreServiceWithDefault';

export function createOIMSortedComputedService<
    TKey extends NonNullable<unknown>, TEntity extends object, TSlots, TSourceKey extends NonNullable<unknown>, TSourceStore,
    TComputedStore = TOIMDefaultSlotStore<TKey, TOIMComputedSlot<readonly TOIMEntitySlot<TEntity>[], TKey>>,
>(
    options: {
        indexService: OIMSlotCollectionIndexService<TKey, TEntity, TSlots, TSourceKey, TSourceStore>;
        sortColumns?: readonly TOIMSortColumn<TEntity>[] | undefined;
        comparator?: ((left: TEntity, right: TEntity) => number) | undefined;
        slotReleasePolicy?: IOIMSlotReleasePolicy | undefined;
        columnSlotStoreService?: IOIMSlotStoreService<string, TOIMComputedColumnSlot> | undefined;
        computedSlotStoreService?: IOIMSlotStoreService<TKey, TOIMComputedSlot<readonly TOIMEntitySlot<TEntity>[], TKey>, TComputedStore> | undefined;
    },
): OIMSortedComputedService<TKey, TEntity, TSlots, TSourceKey, TSourceStore, TComputedStore> {
    return new OIMSortedComputedService<TKey, TEntity, TSlots, TSourceKey, TSourceStore, TComputedStore>({
        indexService: options.indexService,
        computedSlotStoreService: oimSlotStoreServiceWithDefault(options.computedSlotStoreService),
        columnSlotStoreService: options.columnSlotStoreService ?? OIM_DEFAULT_COMPUTED_COLUMN_SLOT_STORE_SERVICE.getValue(),
        sortColumns: options.sortColumns,
        comparator: options.comparator,
        slotReleasePolicy: options.slotReleasePolicy ?? OIMSlotAtUnholdReleasePolicy.INSTANCE,
        storeSlotListener: OIM_DEFAULT_STORE_SLOT_LISTENER.getValue(),
    });
}

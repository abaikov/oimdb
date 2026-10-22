import type { IOIMSlotReleasePolicy } from '../engine/collector/interfaces/IOIMSlotReleasePolicy';
import type { IOIMSlotStoreService } from '../engine/store/interfaces/IOIMSlotStoreService';
import type { TOIMComputedColumnSlot } from '../engine/column/types/TOIMComputedColumnSlot';
import type { TOIMComputedSlot } from '../engine/computed/types/TOIMComputedSlot';
import type { TOIMEntitySlot } from '../engine/entity/types/TOIMEntitySlot';
import type { TOIMDefaultSlotStore } from '../engine/store/types/TOIMDefaultSlotStore';
import type { OIMIndexService } from '../facade/index/OIMIndexService';
import type { TOIMSortColumn } from '../facade/computed/types/TOIMSortColumn';
import { OIMSlotReleasePolicyAtUnhold } from '../engine/collector/OIMSlotReleasePolicyAtUnhold';
import { OIMComputedServiceSorted } from '../facade/computed/OIMComputedServiceSorted';
import { OIM_DEFAULT_COMPUTED_COLUMN_SLOT_STORE_SERVICE } from './defaults/OIM_DEFAULT_COMPUTED_COLUMN_SLOT_STORE_SERVICE';
import { OIM_DEFAULT_STORE_SLOT_LISTENER } from './defaults/OIM_DEFAULT_STORE_SLOT_LISTENER';
import { oimSlotStoreServiceWithDefault } from './utils/oimSlotStoreServiceWithDefault';

export function createOIMComputedServiceSorted<
    TKey, TEntity extends object, TSlots, TSourceKey, TSourceStore,
    TComputedStore = TOIMDefaultSlotStore<TKey, TOIMComputedSlot<readonly TOIMEntitySlot<TEntity>[], TKey>>,
>(
    options: {
        indexService: OIMIndexService<TKey, TEntity, TSlots, TSourceKey, TSourceStore>;
        sortColumns?: readonly TOIMSortColumn<TEntity>[] | undefined;
        comparator?: ((left: TEntity, right: TEntity) => number) | undefined;
        slotReleasePolicy?: IOIMSlotReleasePolicy | undefined;
        columnSlotStoreService?: IOIMSlotStoreService<string, TOIMComputedColumnSlot> | undefined;
    } & ([TComputedStore] extends [Map<TKey, TOIMComputedSlot<readonly TOIMEntitySlot<TEntity>[], TKey>>]
        ? { computedSlotStoreService?: IOIMSlotStoreService<TKey, TOIMComputedSlot<readonly TOIMEntitySlot<TEntity>[], TKey>, TComputedStore> | undefined }
        : { computedSlotStoreService: IOIMSlotStoreService<TKey, TOIMComputedSlot<readonly TOIMEntitySlot<TEntity>[], TKey>, TComputedStore> }),
): OIMComputedServiceSorted<TKey, TEntity, TSlots, TSourceKey, TSourceStore, TComputedStore> {
    return new OIMComputedServiceSorted<TKey, TEntity, TSlots, TSourceKey, TSourceStore, TComputedStore>({
        indexService: options.indexService,
        computedSlotStoreService: oimSlotStoreServiceWithDefault(options.computedSlotStoreService),
        columnSlotStoreService: options.columnSlotStoreService ?? OIM_DEFAULT_COMPUTED_COLUMN_SLOT_STORE_SERVICE.getValue(),
        sortColumns: options.sortColumns,
        comparator: options.comparator,
        slotReleasePolicy: options.slotReleasePolicy ?? OIMSlotReleasePolicyAtUnhold.INSTANCE,
        storeSlotListener: OIM_DEFAULT_STORE_SLOT_LISTENER.getValue(),
    });
}

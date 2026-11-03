import type { TOIMColumnGroup } from '../column/types/TOIMColumnGroup';
import type { IOIMSlotSubscriptionListener } from '../slot/interfaces/IOIMSlotSubscriptionListener';
import { resolveOIMColumnSlotOwnerOptions } from '../column/utils/resolveOIMColumnSlotOwnerOptions';
import type { IOIMSlotReleasePolicy } from '../collector/interfaces/IOIMSlotReleasePolicy';
import type { IOIMSlotStoreService } from '../store/interfaces/IOIMSlotStoreService';
import type { TOIMComputedColumnSlot } from '../column/types/TOIMComputedColumnSlot';
import type { TOIMComputedSlot } from './types/TOIMComputedSlot';
import type { TOIMEntitySlot } from '../entity/types/TOIMEntitySlot';
import type { TOIMDefaultSlotStore } from '../store/types/TOIMDefaultSlotStore';
import type { OIMSlotCollectionIndexService } from '../index/OIMSlotCollectionIndexService';
import type { TOIMSortColumn } from './types/TOIMSortColumn';
import { OIMSlotAtUnholdReleasePolicy } from '../collector/OIMSlotAtUnholdReleasePolicy';
import { OIMSortedComputedService } from './OIMSortedComputedService';
import { OIM_DEFAULT_COMPUTED_COLUMN_SLOT_STORE_SERVICE } from '../db/constants/OIM_DEFAULT_COMPUTED_COLUMN_SLOT_STORE_SERVICE';
import { OIM_DEFAULT_STORE_SLOT_LISTENER } from '../db/constants/OIM_DEFAULT_STORE_SLOT_LISTENER';
import { OIMDefaults } from '../db/OIMDefaults';
import { resolveOIMSlotStoreService } from '../store/utils/resolveOIMSlotStoreService';

export function createOIMSortedComputedService<
    TKey extends NonNullable<unknown>, TEntity extends object, TSlots, TSourceKey extends NonNullable<unknown>, TSourceStore,
    TComputedStore = TOIMDefaultSlotStore<TKey, TOIMComputedSlot<readonly TOIMEntitySlot<TEntity, TSourceKey>[], TKey>>,
>(
    options: {
        defaults?: OIMDefaults | undefined;
        indexService: OIMSlotCollectionIndexService<TKey, TEntity, TSlots, TSourceKey, TSourceStore>;
        sortColumns?: readonly TOIMSortColumn<TEntity>[] | undefined;
        comparator?: ((left: TEntity, right: TEntity) => number) | undefined;
        slotReleasePolicy?: IOIMSlotReleasePolicy | undefined;
        columnSlotStoreService?: IOIMSlotStoreService<string, TOIMComputedColumnSlot> | undefined;
        columnNames?: readonly string[] | undefined;
        columnGroups?: readonly TOIMColumnGroup<string>[] | undefined;
        slotSubscriptionListener?: IOIMSlotSubscriptionListener | undefined;
        slotStoreService?: IOIMSlotStoreService<TKey, TOIMComputedSlot<readonly TOIMEntitySlot<TEntity, TSourceKey>[], TKey>, TComputedStore> | undefined;
    },
): OIMSortedComputedService<TKey, TEntity, TSlots, TSourceKey, TSourceStore, TComputedStore> {
    const defaults = options.defaults ?? OIMDefaults.INSTANCE;
    return new OIMSortedComputedService<TKey, TEntity, TSlots, TSourceKey, TSourceStore, TComputedStore>({
        indexService: options.indexService,
        slotStoreService: resolveOIMSlotStoreService(options.slotStoreService),
        columnSlotOwnerOptions: resolveOIMColumnSlotOwnerOptions(
            options.columnSlotStoreService, options.columnNames, options.columnGroups,
            defaults.computedColumnSlotStoreService ?? OIM_DEFAULT_COMPUTED_COLUMN_SLOT_STORE_SERVICE.getValue(),
        ),
        slotSubscriptionListener: options.slotSubscriptionListener,
        sortColumns: options.sortColumns,
        comparator: options.comparator,
        slotReleasePolicy: options.slotReleasePolicy ?? OIMSlotAtUnholdReleasePolicy.INSTANCE,
        storeSlotListener: defaults.storeSlotListener ?? OIM_DEFAULT_STORE_SLOT_LISTENER.getValue(),
    });
}

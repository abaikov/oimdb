import type { IOIMSlotReleasePolicy } from '../../../engine/collector/interfaces/IOIMSlotReleasePolicy';
import type { TOIMComputedColumnSlot } from '../../../engine/column/types/TOIMComputedColumnSlot';
import type { TOIMComputedSlot } from '../../../engine/computed/types/TOIMComputedSlot';
import type { TOIMEntitySlot } from '../../../engine/entity/types/TOIMEntitySlot';
import type { IOIMStoreSlotListener } from '../../../engine/slot/interfaces/IOIMStoreSlotListener';
import type { IOIMSlotStoreService } from '../../../engine/store/interfaces/IOIMSlotStoreService';
import type { OIMSlotCollectionIndexService } from '../../index/OIMSlotCollectionIndexService';
import type { TOIMSortColumn } from './TOIMSortColumn';

export type TOIMSortedComputedServiceOptions<
    TKey extends NonNullable<unknown>, TEntity extends object, TSlots, TSourceKey extends NonNullable<unknown>, TSourceStore, TComputedStore,
> = {
    indexService: OIMSlotCollectionIndexService<TKey, TEntity, TSlots, TSourceKey, TSourceStore>;
    computedSlotStoreService: IOIMSlotStoreService<TKey, TOIMComputedSlot<readonly TOIMEntitySlot<TEntity>[], TKey>, TComputedStore>;
    columnSlotStoreService: IOIMSlotStoreService<string, TOIMComputedColumnSlot>;
    sortColumns?: readonly TOIMSortColumn<TEntity>[] | undefined;
    comparator?: ((left: TEntity, right: TEntity) => number) | undefined;
    slotReleasePolicy: IOIMSlotReleasePolicy;
    storeSlotListener: IOIMStoreSlotListener;
};

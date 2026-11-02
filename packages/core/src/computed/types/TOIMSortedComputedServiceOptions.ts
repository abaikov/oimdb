import type { IOIMSlotReleasePolicy } from '../../collector/interfaces/IOIMSlotReleasePolicy';
import type { TOIMComputedColumnSlot } from '../../column/types/TOIMComputedColumnSlot';
import type { TOIMComputedSlot } from './TOIMComputedSlot';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { IOIMStoreSlotListener } from '../../slot/interfaces/IOIMStoreSlotListener';
import type { IOIMSlotStoreService } from '../../store/interfaces/IOIMSlotStoreService';
import type { OIMSlotCollectionIndexService } from '../../index/OIMSlotCollectionIndexService';
import type { TOIMSortColumn } from './TOIMSortColumn';

export type TOIMSortedComputedServiceOptions<
    TKey extends NonNullable<unknown>, TEntity extends object, TSlots, TSourceKey extends NonNullable<unknown>, TSourceStore, TComputedStore,
> = {
    indexService: OIMSlotCollectionIndexService<TKey, TEntity, TSlots, TSourceKey, TSourceStore>;
    computedSlotStoreService: IOIMSlotStoreService<TKey, TOIMComputedSlot<readonly TOIMEntitySlot<TEntity, TSourceKey>[], TKey>, TComputedStore>;
    columnSlotStoreService: IOIMSlotStoreService<string, TOIMComputedColumnSlot>;
    sortColumns?: readonly TOIMSortColumn<TEntity>[] | undefined;
    comparator?: ((left: TEntity, right: TEntity) => number) | undefined;
    slotReleasePolicy: IOIMSlotReleasePolicy;
    storeSlotListener: IOIMStoreSlotListener;
};

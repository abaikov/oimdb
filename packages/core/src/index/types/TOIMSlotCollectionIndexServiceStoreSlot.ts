import type { OIMSlotCollectionIndexService } from '../OIMSlotCollectionIndexService';

export type TOIMSlotCollectionIndexServiceStoreSlot<
    TKey extends NonNullable<unknown>, TEntity extends object, TSlots, TSourceKey extends NonNullable<unknown>, TSourceStore,
> = Parameters<
    OIMSlotCollectionIndexService<TKey, TEntity, TSlots, TSourceKey, TSourceStore>['getBucketColumnByKey']
>[0];

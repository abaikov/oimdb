import type { OIMIndexService } from '../OIMIndexService';

export type TOIMIndexServiceStoreSlot<TKey, TEntity extends object, TSlots, TSourceKey, TSourceStore> = Parameters<
    OIMIndexService<TKey, TEntity, TSlots, TSourceKey, TSourceStore>['getBucketColumnByKey']
>[0];

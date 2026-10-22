import type { TOIMBucketSlot, TOIMDefaultSlotStore, TOIMEntitySlot, TOIMStoreKey, TOIMStoreSlot } from '@oimdb/core';
import type { TOIMReduxBucketCollectionService } from './TOIMReduxBucketCollectionService';
import type { TOIMReduxEntityCollectionService } from './TOIMReduxEntityCollectionService';

export type TOIMReduxGlobalIndex<
    TPk extends TOIMStoreKey,
    TEntity extends object,
    TEntityStore = TOIMDefaultSlotStore<TOIMStoreKey, TOIMEntitySlot<TEntity, TOIMStoreKey>>,
    TBucketStore = TOIMDefaultSlotStore<TOIMStoreKey, TOIMBucketSlot<unknown, TOIMStoreKey>>,
> = {
    readonly rowPkPhantom?: TPk;
    readonly bucketService: TOIMReduxBucketCollectionService<TBucketStore>;
    readonly bucketSlot: TOIMBucketSlot<unknown, TOIMStoreKey>;
    readonly entityService: TOIMReduxEntityCollectionService<TEntity, TEntityStore>;
    readonly entityStoreSlot: TOIMStoreSlot<TEntityStore, TOIMEntitySlot<TEntity, TOIMStoreKey>, Partial<TEntity>>;
};

import type { TOIMBucketSlot, TOIMDefaultSlotStore, TOIMEntitySlot, TOIMStoreKey, TOIMStoreSlot } from '@oimdb/core';
import type { TOIMReduxBucketCollectionService } from './TOIMReduxBucketCollectionService';
import type { TOIMReduxEntityCollectionService } from './TOIMReduxEntityCollectionService';

// THE STORE IS NOT A FIELD AND MUST NOT BE; both key parameters are phantoms
// and must stay so.
export type TOIMReduxKeyedIndex<
    TIndexKey extends TOIMStoreKey,
    TPk extends TOIMStoreKey,
    TEntity extends object,
    TBucketStore = TOIMDefaultSlotStore<TOIMStoreKey, TOIMBucketSlot<unknown, TOIMStoreKey>>,
    TEntityStore = TOIMDefaultSlotStore<TOIMStoreKey, TOIMEntitySlot<TEntity, TOIMStoreKey>>,
> = {
    readonly keyedBy?: TIndexKey;
    readonly rowPkPhantom?: TPk;
    readonly bucketService: TOIMReduxBucketCollectionService<TBucketStore>;
    readonly bucketStoreSlot: TOIMStoreSlot<TBucketStore, TOIMBucketSlot<unknown, TOIMStoreKey>, readonly TOIMEntitySlot[]>;
    readonly entityService: TOIMReduxEntityCollectionService<TEntity, TEntityStore>;
    readonly entityStoreSlot: TOIMStoreSlot<TEntityStore, TOIMEntitySlot<TEntity, TOIMStoreKey>, Partial<TEntity>>;
};

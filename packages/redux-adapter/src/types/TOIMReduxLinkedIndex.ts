import type { TOIMBucketSlot, TOIMDefaultSlotStore, TOIMEntitySlot, TOIMStoreKey, TOIMStoreSlot } from '@oimdb/core';
import type { TOIMReduxBucketCollectionService } from './TOIMReduxBucketCollectionService';

// The linked entities usually live in a DIFFERENT store slot from the entity carrying the
// field — hence the explicit `linkedEntityService` and `linkedEntityStoreSlot`.
export type TOIMReduxLinkedIndex<
    TEntity extends object,
    TLinkedEntity extends object,
    TBucketStore = TOIMDefaultSlotStore<TOIMStoreKey, TOIMBucketSlot<unknown, TOIMStoreKey>>,
    TLinkedEntityStore = TOIMDefaultSlotStore<TOIMStoreKey, TOIMEntitySlot<TLinkedEntity, TOIMStoreKey>>,
> = {
    readonly bucketService: TOIMReduxBucketCollectionService<TBucketStore>;
    readonly bucketStoreSlot: TOIMStoreSlot<TBucketStore, TOIMBucketSlot<unknown, TOIMStoreKey>, readonly TOIMEntitySlot[]>;
    readonly linkedEntityService: {
        getSlotByKey(
            linkedEntityStoreSlot: TOIMStoreSlot<TLinkedEntityStore, TOIMEntitySlot<TLinkedEntity, TOIMStoreKey>, Partial<TLinkedEntity>>, key: TOIMStoreKey,
        ): TOIMEntitySlot<TLinkedEntity, TOIMStoreKey>;
    };
    readonly linkedEntityStoreSlot: TOIMStoreSlot<TLinkedEntityStore, TOIMEntitySlot<TLinkedEntity, TOIMStoreKey>, Partial<TLinkedEntity>>;
    readonly fieldName: keyof TEntity;
};

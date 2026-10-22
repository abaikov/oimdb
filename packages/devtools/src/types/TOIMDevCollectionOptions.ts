import type {
    OIMSlotCollectionService, TOIMBucketSlot, TOIMDefaultSlotStore, TOIMEntitySlot, TOIMStoreKey, TOIMStoreSlot,
} from '@oimdb/core';

export type TOIMDevCollectionOptions<
    TBucketStore = TOIMDefaultSlotStore<TOIMStoreKey, TOIMBucketSlot<unknown, TOIMStoreKey>>,
> = {
    indexes?: Record<string, {
        bucketCollectionService: Pick<
            OIMSlotCollectionService<TOIMStoreKey, TOIMBucketSlot<unknown, TOIMStoreKey>, TBucketStore, unknown>, 'getSlots'
        >;
        bucketStoreSlot: TOIMStoreSlot<TBucketStore, TOIMBucketSlot<unknown, TOIMStoreKey>, readonly TOIMEntitySlot[]>;
    }>;
    relations?: Record<string, string>;
    description?: string;
};

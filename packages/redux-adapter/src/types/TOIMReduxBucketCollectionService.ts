import type {
    OIMPushColumnSlotOwner, OIMSlotCollectionService, OIMBucketContentService, TOIMBucketSlot, TOIMColumnSlot,
    TOIMEntitySlot, TOIMStoreKey,
} from '@oimdb/core';

export type TOIMReduxBucketCollectionService<TBucketStore> = OIMSlotCollectionService<
    TOIMStoreKey, TOIMBucketSlot<unknown, TOIMStoreKey>, TBucketStore, OIMBucketContentService<TOIMEntitySlot, unknown>,
    string, TOIMColumnSlot, OIMPushColumnSlotOwner, readonly TOIMEntitySlot[]
>;

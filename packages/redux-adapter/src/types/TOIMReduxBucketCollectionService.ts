import type {
    OIMColumnOwnerPushDriven, OIMSlotCollectionService, OIMSlotContentBucketService, TOIMBucketSlot, TOIMColumnSlot,
    TOIMEntitySlot, TOIMStoreKey,
} from '@oimdb/core';

export type TOIMReduxBucketCollectionService<TBucketStore> = OIMSlotCollectionService<
    TOIMStoreKey, TOIMBucketSlot<unknown, TOIMStoreKey>, TBucketStore, OIMSlotContentBucketService<TOIMEntitySlot, unknown>,
    string, TOIMColumnSlot, OIMColumnOwnerPushDriven, readonly TOIMEntitySlot[]
>;

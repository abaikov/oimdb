import type {
    OIMPushColumnSlotOwner, OIMWritableSlotCollectionService, OIMEntityContentService, TOIMColumnSlot, TOIMColumnName,
    TOIMEntitySlot, TOIMStoreKey,
} from '@oimdb/core';

export type TOIMReduxEntityCollectionService<TEntity extends object, TStore> = OIMWritableSlotCollectionService<
    TOIMStoreKey, TOIMEntitySlot<TEntity, TOIMStoreKey>, TStore, TEntity,
    OIMEntityContentService<TEntity, TOIMStoreKey, TOIMColumnName<TEntity>>,
    TOIMColumnName<TEntity>, TOIMColumnSlot, OIMPushColumnSlotOwner, Partial<TEntity>
>;

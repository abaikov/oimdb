import type {
    OIMPushColumnSlotOwner, OIMWritableSlotCollectionService, OIMEntityContentService, TOIMColumnSlot, TOIMEntityColumnName,
    TOIMEntitySlot, TOIMStoreKey,
} from '@oimdb/core';

export type TOIMReduxEntityCollectionService<TEntity extends object, TStore> = OIMWritableSlotCollectionService<
    TOIMStoreKey, TOIMEntitySlot<TEntity, TOIMStoreKey>, TStore, TEntity,
    OIMEntityContentService<TEntity, TOIMStoreKey, TOIMEntityColumnName<TEntity>>,
    TOIMEntityColumnName<TEntity>, TOIMColumnSlot, OIMPushColumnSlotOwner, Partial<TEntity>
>;

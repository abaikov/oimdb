import type {
    OIMPushColumnSlotOwner, OIMWritableSlotCollectionService, OIMSlotContentEntityService, TOIMColumnSlot, TOIMEntityColumnName,
    TOIMEntitySlot, TOIMStoreKey,
} from '@oimdb/core';

export type TOIMReduxEntityCollectionService<TEntity extends object, TStore> = OIMWritableSlotCollectionService<
    TOIMStoreKey, TOIMEntitySlot<TEntity, TOIMStoreKey>, TStore, TEntity,
    OIMSlotContentEntityService<TEntity, TOIMStoreKey, TOIMEntityColumnName<TEntity>>,
    TOIMEntityColumnName<TEntity>, TOIMColumnSlot, OIMPushColumnSlotOwner, Partial<TEntity>
>;

import type {
    OIMColumnOwnerPushDriven, OIMSlotCollectionService, OIMSlotContentEntityService, TOIMColumnSlot, TOIMEntityColumnName,
    TOIMEntitySlot, TOIMStoreKey,
} from '@oimdb/core';

export type TOIMReduxEntityCollectionService<TEntity extends object, TStore> = OIMSlotCollectionService<
    TOIMStoreKey, TOIMEntitySlot<TEntity, TOIMStoreKey>, TStore,
    OIMSlotContentEntityService<TEntity, TOIMStoreKey, TStore, TOIMEntityColumnName<TEntity>>,
    TOIMEntityColumnName<TEntity>, TOIMColumnSlot, OIMColumnOwnerPushDriven, Partial<TEntity>
>;

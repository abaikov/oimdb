import type {
    OIMColumnOwnerPushDriven, OIMSlotCollectionService, OIMSlotContentEntityService, TOIMColumnSlot, TOIMEntitySlot, TOIMStoreKey,
} from '@oimdb/core';

export type TOIMPersistEntityCollectionService<TKey extends TOIMStoreKey, TEntity extends object, TStore> = Pick<
    OIMSlotCollectionService<
        TKey, TOIMEntitySlot<TEntity, TKey>, TStore,
        Pick<OIMSlotContentEntityService<TEntity, TKey, TStore>, 'upsertEntities' | 'deleteEntity' | 'deleteEntities'>,
        string, TOIMColumnSlot, OIMColumnOwnerPushDriven, Partial<TEntity>
    >,
    'getSlots' | 'findSlotByKey' | 'slotContentService'
>;

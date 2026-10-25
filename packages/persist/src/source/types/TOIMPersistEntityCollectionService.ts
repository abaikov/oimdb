import type {
    OIMPushColumnSlotOwner, OIMSlotContentEntityService, OIMWritableSlotCollectionService, TOIMColumnSlot, TOIMEntitySlot,
} from '@oimdb/core';

export type TOIMPersistEntityCollectionService<TKey extends NonNullable<unknown>, TEntity extends object, TStore> = Pick<
    OIMWritableSlotCollectionService<
        TKey, TOIMEntitySlot<TEntity, TKey>, TStore, TEntity, OIMSlotContentEntityService<TEntity, TKey>,
        string, TOIMColumnSlot, OIMPushColumnSlotOwner, Partial<TEntity>
    >,
    'getSlots' | 'findSlotByKey' | 'writeSlotContentByKey' | 'writeInBatch' | 'slotContentService'
>;

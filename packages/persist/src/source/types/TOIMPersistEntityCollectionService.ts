import type {
    OIMPushColumnSlotOwner, OIMEntityContentService, OIMWritableSlotCollectionService, TOIMColumnSlot, TOIMEntitySlot,
} from '@oimdb/core';

export type TOIMPersistEntityCollectionService<TKey extends NonNullable<unknown>, TEntity extends object, TStore> = Pick<
    OIMWritableSlotCollectionService<
        TKey, TOIMEntitySlot<TEntity, TKey>, TStore, TEntity, OIMEntityContentService<TEntity, TKey>,
        string, TOIMColumnSlot, OIMPushColumnSlotOwner, Partial<TEntity>
    >,
    'getSlots' | 'peekSlotByKey' | 'writeSlotContentByKey' | 'writeInBatch' | 'slotContentService'
>;

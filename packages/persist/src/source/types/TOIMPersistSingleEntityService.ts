import type {
    OIMPushColumnSlotOwner, OIMSlotContentEntityService, OIMWritableSingleSlotService, TOIMColumnSlot, TOIMEntityContentSlot,
} from '@oimdb/core';

export type TOIMPersistSingleEntityService<TEntity extends object> = Pick<
    OIMWritableSingleSlotService<
        TOIMEntityContentSlot<TEntity>, TEntity, OIMSlotContentEntityService<TEntity>,
        string, TOIMColumnSlot, OIMPushColumnSlotOwner
    >,
    'getSingleSlot' | 'findSingleSlot' | 'writeSingleSlotContent'
>;

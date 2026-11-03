import type {
    OIMPushColumnSlotOwner, OIMEntityContentService, OIMWritableSingleSlotService, TOIMColumnSlot, TOIMEntityContentSlot,
} from '@oimdb/core';

export type TOIMPersistSingleEntityService<TEntity extends object> = Pick<
    OIMWritableSingleSlotService<
        TOIMEntityContentSlot<TEntity>, TEntity, OIMEntityContentService<TEntity>,
        string, TOIMColumnSlot, OIMPushColumnSlotOwner
    >,
    'getSingleSlot' | 'peekSingleSlot' | 'writeSingleSlotContent'
>;

import type {
    OIMColumnOwnerPushDriven, OIMSingleSlotService, OIMSlotContentEntityService, TOIMColumnSlot, TOIMEntitySlot,
    TOIMSingleSlotStore,
} from '@oimdb/core';

export type TOIMPersistSingleEntityService<TEntity extends object> = Pick<
    OIMSingleSlotService<
        TOIMEntitySlot<TEntity, void>,
        Pick<OIMSlotContentEntityService<TEntity, void, TOIMSingleSlotStore<TOIMEntitySlot<TEntity, void>>>, 'upsertEntity'>,
        string, TOIMColumnSlot, OIMColumnOwnerPushDriven, Partial<TEntity>
    >,
    'getSingleSlot' | 'findSingleSlot' | 'slotContentService'
>;

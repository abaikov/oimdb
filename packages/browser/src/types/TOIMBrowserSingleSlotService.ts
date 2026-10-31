import type { OIMSingleSlotService, OIMSlotContentEntityService, TOIMEntityContentSlot } from '@oimdb/core';

export type TOIMBrowserSingleSlotService<TEntity extends object> = OIMSingleSlotService<
    TOIMEntityContentSlot<TEntity>, OIMSlotContentEntityService<TEntity>
>;

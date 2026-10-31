import type { OIMSingleSlotService, OIMEntityContentService, TOIMEntityContentSlot } from '@oimdb/core';

export type TOIMBrowserSingleSlotService<TEntity extends object> = OIMSingleSlotService<
    TOIMEntityContentSlot<TEntity>, OIMEntityContentService<TEntity>
>;

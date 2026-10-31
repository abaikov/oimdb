import { createOIMSingleSlotService, createOIMSlotContentEntityService } from '@oimdb/core';
import type { OIMSlotContentEntityService } from '@oimdb/core';
import type { OIMBrowserSlotSubscriptionListener } from './OIMBrowserSlotSubscriptionListener';
import type { TOIMBrowserSingleSlotService } from './types/TOIMBrowserSingleSlotService';
import type { TOIMBrowserSingleSlotServiceOptions } from './types/TOIMBrowserSingleSlotServiceOptions';

export function createOIMBrowserSingleSlotService<TEntity extends object>(
    createSlotSubscriptionListener: (slotContentEntityService: OIMSlotContentEntityService<TEntity>) => OIMBrowserSlotSubscriptionListener<TEntity>,
    options: TOIMBrowserSingleSlotServiceOptions,
): TOIMBrowserSingleSlotService<TEntity> {
    const slotContentService = createOIMSlotContentEntityService<TEntity>({ defaults: options.defaults });
    return createOIMSingleSlotService({
        defaults: options.defaults,
        slotContentService,
        slotSubscriptionListener: createSlotSubscriptionListener(slotContentService),
    });
}

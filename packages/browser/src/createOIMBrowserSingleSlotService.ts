import { createOIMSingleSlotService, createOIMEntityContentService } from '@oimdb/core';
import type { OIMBrowserSlotSubscriptionListener } from './OIMBrowserSlotSubscriptionListener';
import type { TOIMBrowserSingleSlotService } from './types/TOIMBrowserSingleSlotService';
import type { TOIMBrowserSingleSlotServiceOptions } from './types/TOIMBrowserSingleSlotServiceOptions';
import type { TOIMBrowserSlotSubscriptionListenerOptions } from './types/TOIMBrowserSlotSubscriptionListenerOptions';

export function createOIMBrowserSingleSlotService<TEntity extends object>(
    createSlotSubscriptionListener: (browserSlotSubscriptionListenerOptions: TOIMBrowserSlotSubscriptionListenerOptions<TEntity>) => OIMBrowserSlotSubscriptionListener<TEntity>,
    options: TOIMBrowserSingleSlotServiceOptions,
): TOIMBrowserSingleSlotService<TEntity> {
    const slotContentService = createOIMEntityContentService<TEntity>({ defaults: options.defaults });
    return createOIMSingleSlotService({
        defaults: options.defaults,
        slotContentService,
        slotSubscriptionListener: createSlotSubscriptionListener({
            entityContentService: slotContentService, onBrowserEntityWritten: options.onBrowserEntityWritten,
        }),
    });
}

import type { OIMEntityContentService } from '@oimdb/core';

export type TOIMBrowserSlotSubscriptionListenerOptions<TEntity extends object> = {
    entityContentService: OIMEntityContentService<TEntity>;
    onBrowserEntityWritten?: (() => void) | undefined;
};

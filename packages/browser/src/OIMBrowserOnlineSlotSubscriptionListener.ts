import type { TOIMDisposer } from '@oimdb/core';
import type { TOIMBrowserOnlineEntity } from './types/TOIMBrowserOnlineEntity';
import { OIMBrowserSlotSubscriptionListener } from './OIMBrowserSlotSubscriptionListener';
import { listenToOIMBrowserWindow } from './utils/listenToOIMBrowserWindow';

export class OIMBrowserOnlineSlotSubscriptionListener extends OIMBrowserSlotSubscriptionListener<TOIMBrowserOnlineEntity> {
    protected readCurrentEntity(): TOIMBrowserOnlineEntity {
        const navigatorOfBrowser = (globalThis as { navigator?: { onLine?: unknown } }).navigator;
        return { isOnline: typeof navigatorOfBrowser?.onLine === 'boolean' ? navigatorOfBrowser.onLine : true };
    }

    protected listenToBrowser(onBrowserChanged: () => void): TOIMDisposer {
        return listenToOIMBrowserWindow(['online', 'offline'], onBrowserChanged);
    }
}

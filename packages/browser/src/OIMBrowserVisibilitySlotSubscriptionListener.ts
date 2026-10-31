import type { TOIMDisposer } from '@oimdb/core';
import type { TOIMBrowserVisibilityEntity } from './types/TOIMBrowserVisibilityEntity';
import { OIMBrowserSlotSubscriptionListener } from './OIMBrowserSlotSubscriptionListener';
import { OIM_NO_BROWSER_LISTENER_DISPOSER } from './constants/OIM_NO_BROWSER_LISTENER_DISPOSER';

export class OIMBrowserVisibilitySlotSubscriptionListener extends OIMBrowserSlotSubscriptionListener<TOIMBrowserVisibilityEntity> {
    protected readCurrentEntity(): TOIMBrowserVisibilityEntity {
        const documentOfBrowser = (globalThis as { document?: { visibilityState?: unknown } }).document;
        return { isVisible: documentOfBrowser?.visibilityState !== 'hidden' };
    }

    protected listenToBrowser(onBrowserChanged: () => void): TOIMDisposer {
        const documentOfBrowser = (globalThis as { document?: EventTarget }).document;
        if (documentOfBrowser === undefined || typeof documentOfBrowser.addEventListener !== 'function') return OIM_NO_BROWSER_LISTENER_DISPOSER;
        documentOfBrowser.addEventListener('visibilitychange', onBrowserChanged);
        return () => { documentOfBrowser.removeEventListener('visibilitychange', onBrowserChanged); };
    }
}

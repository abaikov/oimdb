import type { TOIMDisposer } from '@oimdb/core';
import type { TOIMBrowserLocationEntity } from './types/TOIMBrowserLocationEntity';
import { OIMBrowserSlotSubscriptionListener } from './OIMBrowserSlotSubscriptionListener';
import { listenToOIMBrowserWindow } from './utils/listenToOIMBrowserWindow';

export class OIMBrowserLocationSlotSubscriptionListener extends OIMBrowserSlotSubscriptionListener<TOIMBrowserLocationEntity> {
    protected readCurrentEntity(): TOIMBrowserLocationEntity {
        const locationOfBrowser = (globalThis as { location?: { href: string; pathname: string; search: string; hash: string } }).location;
        if (locationOfBrowser === undefined) return { href: '', pathname: '', search: '', hash: '' };
        return { href: locationOfBrowser.href, pathname: locationOfBrowser.pathname, search: locationOfBrowser.search, hash: locationOfBrowser.hash };
    }

    protected listenToBrowser(onBrowserChanged: () => void): TOIMDisposer {
        const navigationOfBrowser = (globalThis as { navigation?: EventTarget }).navigation;
        if (navigationOfBrowser !== undefined && typeof navigationOfBrowser.addEventListener === 'function') {
            navigationOfBrowser.addEventListener('currententrychange', onBrowserChanged);
            return () => { navigationOfBrowser.removeEventListener('currententrychange', onBrowserChanged); };
        }
        return listenToOIMBrowserWindow(['popstate', 'hashchange'], onBrowserChanged);
    }
}

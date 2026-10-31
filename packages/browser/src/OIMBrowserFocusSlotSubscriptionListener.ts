import type { TOIMDisposer } from '@oimdb/core';
import type { TOIMBrowserFocusEntity } from './types/TOIMBrowserFocusEntity';
import { OIMBrowserSlotSubscriptionListener } from './OIMBrowserSlotSubscriptionListener';
import { oimListenToBrowserWindow } from './utils/oimListenToBrowserWindow';

export class OIMBrowserFocusSlotSubscriptionListener extends OIMBrowserSlotSubscriptionListener<TOIMBrowserFocusEntity> {
    protected readCurrentEntity(): TOIMBrowserFocusEntity {
        const documentOfBrowser = (globalThis as { document?: { hasFocus?: unknown } }).document;
        return { isFocused: typeof documentOfBrowser?.hasFocus === 'function' ? (documentOfBrowser.hasFocus as () => boolean).call(documentOfBrowser) : true };
    }

    protected listenToBrowser(onBrowserChanged: () => void): TOIMDisposer {
        return oimListenToBrowserWindow(['focus', 'blur'], onBrowserChanged);
    }
}

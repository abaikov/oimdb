import type { TOIMDisposer } from '@oimdb/core';
import { OIM_NO_BROWSER_LISTENER_DISPOSER } from '../constants/OIM_NO_BROWSER_LISTENER_DISPOSER';

export function oimListenToBrowserWindow(eventNames: readonly string[], onBrowserChanged: () => void): TOIMDisposer {
    const browserWindow = globalThis as { addEventListener?: EventTarget['addEventListener']; removeEventListener?: EventTarget['removeEventListener'] };
    if (typeof browserWindow.addEventListener !== 'function' || typeof browserWindow.removeEventListener !== 'function') {
        return OIM_NO_BROWSER_LISTENER_DISPOSER;
    }
    const addEventListener = browserWindow.addEventListener.bind(globalThis);
    const removeEventListener = browserWindow.removeEventListener.bind(globalThis);
    for (const eventName of eventNames) addEventListener(eventName, onBrowserChanged);
    return () => {
        for (const eventName of eventNames) removeEventListener(eventName, onBrowserChanged);
    };
}

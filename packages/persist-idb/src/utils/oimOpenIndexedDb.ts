import type { TOIMPersistIndexedDbOpenRequestOptions } from '../types/TOIMPersistIndexedDbOpenRequestOptions';

const OIM_BLOCKED_FOR_TOO_LONG_MS = 5000;

export function oimOpenIndexedDb(persistIndexedDbOpenRequestOptions: TOIMPersistIndexedDbOpenRequestOptions): Promise<IDBDatabase> {
    const { indexedDb, databaseName, databaseVersion, onUpgradeNeeded } = persistIndexedDbOpenRequestOptions;
    return new Promise((resolve, reject) => {
        const request = indexedDb.open(databaseName, databaseVersion);
        let blockedTimer: ReturnType<typeof setTimeout> | undefined;
        let hasGivenUp = false;
        const stopWaiting = (): void => {
            if (blockedTimer === undefined) return;
            clearTimeout(blockedTimer);
            blockedTimer = undefined;
        };
        request.onerror = () => { stopWaiting(); reject(request.error); };
        request.onsuccess = () => {
            stopWaiting();
            if (hasGivenUp) {
                request.result.close();
                return;
            }
            resolve(request.result);
        };
        request.onupgradeneeded = () => {
            stopWaiting();
            onUpgradeNeeded?.(request.result);
        };
        request.onblocked = () => {
            if (blockedTimer !== undefined) return;
            blockedTimer = setTimeout(() => {
                blockedTimer = undefined;
                hasGivenUp = true;
                reject(new Error(
                    `[OIMPersist]: upgrading IndexedDB database "${databaseName}" has been blocked for `
                    + `${OIM_BLOCKED_FOR_TOO_LONG_MS} ms by another open connection, a second tab or a connection `
                    + 'this process did not close. The write was not applied.',
                ));
            }, OIM_BLOCKED_FOR_TOO_LONG_MS);
        };
    });
}

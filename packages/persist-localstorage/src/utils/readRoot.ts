import type { OIMLocalStoragePersistor } from '../core/OIMLocalStoragePersistor';

/**
 * Reads and deserializes the root object stored under `storageKey`.
 * Returns `undefined` when the key is absent.
 */
export function readRoot(
    persistor: OIMLocalStoragePersistor,
    storageKey: string
): Record<string, unknown> | undefined {
    const raw = persistor.storage.storage.getItem(storageKey);
    return raw === null
        ? undefined
        : (persistor.storage.deserialize(raw) as Record<string, unknown>);
}

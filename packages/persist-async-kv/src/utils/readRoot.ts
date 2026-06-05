import type { OIMAsyncKVPersistor } from '../core/OIMAsyncKVPersistor';

/**
 * Reads and deserializes the root object stored under `storageKey`.
 * Returns `undefined` when the key is absent.
 */
export async function readRoot(
    persistor: OIMAsyncKVPersistor,
    storageKey: string
): Promise<Record<string, unknown> | undefined> {
    const raw = await persistor.storage.storage.getItem(storageKey);
    return raw === null
        ? undefined
        : (persistor.storage.deserialize(raw) as Record<string, unknown>);
}

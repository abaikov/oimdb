import { TOIMLocalStorageBatchStrategy } from '../types/TOIMLocalStorageBatchStrategy';
import { TOIMLocalStorageEntryOptions } from '../types/TOIMLocalStorageEntryOptions';

/**
 * Stores the whole snapshot under a single localStorage key.
 */
export function createLocalStorageEntryStrategy<TSnapshot>(
    options: TOIMLocalStorageEntryOptions
): TOIMLocalStorageBatchStrategy<TSnapshot> {
    const { storageKey } = options;
    return {
        storageKeys: [storageKey],
        async read(p) {
            const raw = p.storage.storage.getItem(storageKey);
            return raw === null
                ? undefined
                : (p.storage.deserialize(raw) as TSnapshot);
        },
        async write(p, snapshot) {
            p.storage.storage.setItem(storageKey, p.storage.serialize(snapshot));
        },
        async clear(p) {
            p.storage.storage.removeItem(storageKey);
        },
        writeToRoots(roots, toDelete, snapshot) {
            roots.set(storageKey, snapshot);
            toDelete.delete(storageKey);
        },
        clearFromRoots(_roots, toDelete) {
            toDelete.add(storageKey);
        },
    };
}

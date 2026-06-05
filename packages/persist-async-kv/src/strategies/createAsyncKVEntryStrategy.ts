import { TOIMAsyncKVBatchStrategy } from '../types/TOIMAsyncKVBatchStrategy';
import { TOIMAsyncKVEntryOptions } from '../types/TOIMAsyncKVEntryOptions';

/**
 * Stores the whole snapshot under a single async KV key.
 */
export function createAsyncKVEntryStrategy<TSnapshot>(
    options: TOIMAsyncKVEntryOptions
): TOIMAsyncKVBatchStrategy<TSnapshot> {
    const { storageKey } = options;
    return {
        storageKeys: [storageKey],
        async read(p) {
            const raw = await p.storage.storage.getItem(storageKey);
            return raw === null
                ? undefined
                : (p.storage.deserialize(raw) as TSnapshot);
        },
        async write(p, snapshot) {
            await p.storage.storage.setItem(
                storageKey,
                p.storage.serialize(snapshot)
            );
        },
        async clear(p) {
            await p.storage.storage.removeItem(storageKey);
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

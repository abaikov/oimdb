import { TOIMAsyncKVBatchStrategy } from '../types/TOIMAsyncKVBatchStrategy';
import { TOIMAsyncKVPathOptions } from '../types/TOIMAsyncKVPathOptions';
import { deletePath } from '../utils/deletePath';
import { getPath } from '../utils/getPath';
import { readRoot } from '../utils/readRoot';
import { setPath } from '../utils/setPath';

/**
 * Stores the snapshot at a nested `path` inside a shared root async KV key.
 * Multiple path strategies sharing the same root key are merged into a single
 * write during a batch persist.
 */
export function createAsyncKVPathStrategy<TSnapshot>(
    options: TOIMAsyncKVPathOptions
): TOIMAsyncKVBatchStrategy<TSnapshot> {
    const { storageKey, path } = options;
    return {
        storageKeys: [storageKey],
        async read(p) {
            const root = await readRoot(p, storageKey);
            return getPath(root, path) as TSnapshot | undefined;
        },
        async write(p, snapshot) {
            const root = (await readRoot(p, storageKey)) ?? {};
            setPath(root, path, snapshot);
            await p.storage.storage.setItem(
                storageKey,
                p.storage.serialize(root)
            );
        },
        async clear(p) {
            const root = await readRoot(p, storageKey);
            if (!root) return;
            deletePath(root, path);
            await p.storage.storage.setItem(
                storageKey,
                p.storage.serialize(root)
            );
        },
        writeToRoots(roots, toDelete, snapshot) {
            let root = roots.get(storageKey) as
                | Record<string, unknown>
                | undefined;
            if (!root || typeof root !== 'object') root = {};
            setPath(root, path, snapshot);
            roots.set(storageKey, root);
            toDelete.delete(storageKey);
        },
        clearFromRoots(roots) {
            const root = roots.get(storageKey) as
                | Record<string, unknown>
                | undefined;
            if (!root) return;
            deletePath(root, path);
            roots.set(storageKey, root);
        },
    };
}

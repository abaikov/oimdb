import { TOIMPersistStrategy } from '@oimdb/persist';
import type { OIMJsonPersistor } from '../core/OIMJsonPersistor';
import { TOIMJsonEntryStrategyOptions } from '../types/TOIMJsonEntryStrategyOptions';

/**
 * A strategy that reads/writes a single snapshot under one key of the
 * persistor's plain `data` object. Operations are in-memory; the `async`
 * signature only satisfies the engine's strategy contract.
 */
export function createJsonEntryStrategy<TSnapshot>(
    options: TOIMJsonEntryStrategyOptions
): TOIMPersistStrategy<OIMJsonPersistor, TSnapshot> {
    const { storageKey } = options;
    return {
        async read(persistor) {
            return persistor.storage.data[storageKey] as
                | TSnapshot
                | undefined;
        },
        async write(persistor, snapshot) {
            persistor.storage.data[storageKey] = snapshot;
        },
        async clear(persistor) {
            delete persistor.storage.data[storageKey];
        },
    };
}

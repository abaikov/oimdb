import { TOIMIndexedDbBatchStrategy } from '../types/TOIMIndexedDbBatchStrategy';
import { TOIMIndexedDbEntryStrategyOptions } from '../types/TOIMIndexedDbEntryStrategyOptions';
import { normalizePrimaryKey } from '../utils/normalizePrimaryKey';

export function createIndexedDbEntryStrategy<TSnapshot>(
    options: TOIMIndexedDbEntryStrategyOptions
): TOIMIndexedDbBatchStrategy<TSnapshot> {
    const { tableName, primaryKey } = options;
    const normalizedKey = normalizePrimaryKey(primaryKey);
    return {
        tableNames: [tableName],

        async read(persistor) {
            return (await persistor.storage.get(tableName, primaryKey)) as
                | TSnapshot
                | undefined;
        },
        async write(persistor, snapshot) {
            await persistor.storage.put(tableName, primaryKey, snapshot);
        },
        async clear(persistor) {
            await persistor.storage.put(tableName, primaryKey, undefined);
        },

        writeInTx(stores, snapshot) {
            stores[tableName].put(snapshot, normalizedKey);
        },
        clearInTx(stores) {
            stores[tableName].delete(normalizedKey);
        },
    };
}

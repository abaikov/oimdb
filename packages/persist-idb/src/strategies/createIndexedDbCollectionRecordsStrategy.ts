import { TOIMPk } from '@oimdb/core';
import { TOIMCollectionPersistSnapshot } from '@oimdb/persist';
import { TOIMIndexedDbBatchStrategy } from '../types/TOIMIndexedDbBatchStrategy';
import { TOIMIndexedDbRecordsStrategyOptions } from '../types/TOIMIndexedDbRecordsStrategyOptions';
import { normalizePrimaryKey } from '../utils/normalizePrimaryKey';

export function createIndexedDbCollectionRecordsStrategy<
    TPk extends TOIMPk,
    TEntity,
>(
    options: TOIMIndexedDbRecordsStrategyOptions
): TOIMIndexedDbBatchStrategy<TOIMCollectionPersistSnapshot<TPk, TEntity>> {
    const { tableName } = options;
    return {
        tableNames: [tableName],

        async read(persistor) {
            const records = await persistor.storage.getAll(tableName);
            return {
                records: records
                    .filter(record => record.value !== undefined)
                    .map(record => ({
                        pk: record.primaryKey as TPk,
                        value: record.value as TEntity,
                    })),
            };
        },
        async write(persistor, snapshot) {
            await persistor.storage.clear(tableName);
            for (let i = 0; i < snapshot.records.length; i++) {
                const record = snapshot.records[i];
                await persistor.storage.put(tableName, record.pk, record.value);
            }
        },
        async clear(persistor) {
            await persistor.storage.clear(tableName);
        },

        writeInTx(stores, snapshot) {
            const store = stores[tableName];
            store.clear();
            for (let i = 0; i < snapshot.records.length; i++) {
                const record = snapshot.records[i];
                store.put(record.value, normalizePrimaryKey(record.pk));
            }
        },
        clearInTx(stores) {
            stores[tableName].clear();
        },
    };
}

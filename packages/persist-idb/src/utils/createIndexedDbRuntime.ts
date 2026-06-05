import { TOIMIndexedDbRuntime } from '../types/TOIMIndexedDbRuntime';
import { normalizePrimaryKey } from './normalizePrimaryKey';
import { openDatabaseWithTable } from './openDatabaseWithTable';
import { openDatabaseWithTables } from './openDatabaseWithTables';
import { readAllRecords } from './readAllRecords';
import { requestToPromise } from './requestToPromise';
import { transactionToPromise } from './transactionToPromise';

export function createIndexedDbRuntime(options: {
    databaseName: string;
    databaseVersion?: number;
    indexedDb: IDBFactory;
}): TOIMIndexedDbRuntime {
    return {
        ...options,
        async get(tableName, primaryKey) {
            const db = await openDatabaseWithTable(options, tableName);
            try {
                return await requestToPromise(
                    db
                        .transaction(tableName, 'readonly')
                        .objectStore(tableName)
                        .get(normalizePrimaryKey(primaryKey))
                );
            } finally {
                db.close();
            }
        },
        async put(tableName, primaryKey, value) {
            const db = await openDatabaseWithTable(options, tableName);
            try {
                await transactionToPromise(db, [tableName], stores => {
                    if (value === undefined) {
                        stores[tableName].delete(
                            normalizePrimaryKey(primaryKey)
                        );
                    } else {
                        stores[tableName].put(
                            value,
                            normalizePrimaryKey(primaryKey)
                        );
                    }
                });
            } finally {
                db.close();
            }
        },
        async getAll(tableName) {
            const db = await openDatabaseWithTable(options, tableName);
            try {
                return await readAllRecords(db, tableName);
            } finally {
                db.close();
            }
        },
        async clear(tableName) {
            const db = await openDatabaseWithTable(options, tableName);
            try {
                await transactionToPromise(db, [tableName], stores => {
                    stores[tableName].clear();
                });
            } finally {
                db.close();
            }
        },
        async batchWrite(tableNames, fn) {
            const db = await openDatabaseWithTables(options, tableNames);
            try {
                await transactionToPromise(db, tableNames, fn);
            } finally {
                db.close();
            }
        },
    };
}

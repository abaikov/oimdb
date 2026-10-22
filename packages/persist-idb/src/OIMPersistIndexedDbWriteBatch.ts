import { OIMPersistWriteBatchChanges } from '@oimdb/persist';
import type { IOIMPersistWriteBatch } from '@oimdb/persist';
import type { TOIMPersistIndexedDbOpenOptions } from './types/TOIMPersistIndexedDbOpenOptions';
import type { TOIMPersistIndexedDbPrimaryKey } from './types/TOIMPersistIndexedDbPrimaryKey';
import type { TOIMPersistIndexedDbWriteBatchOptions } from './types/TOIMPersistIndexedDbWriteBatchOptions';
import { oimIndexedDbTransactionToPromise } from './utils/oimIndexedDbTransactionToPromise';
import { oimNormalizeIndexedDbPrimaryKey } from './utils/oimNormalizeIndexedDbPrimaryKey';
import { oimOpenIndexedDbWithTables } from './utils/oimOpenIndexedDbWithTables';

type TOIMIndexedDbTableChange = (objectStoreByTableName: ReadonlyMap<string, IDBObjectStore>) => void;

export class OIMPersistIndexedDbWriteBatch implements IOIMPersistWriteBatch {
    private readonly persistIndexedDbOpenOptions: TOIMPersistIndexedDbOpenOptions;
    private readonly tableNames = new Set<string>();
    private readonly persistWriteBatchChanges = new OIMPersistWriteBatchChanges<ReadonlyMap<string, IDBObjectStore>>();

    public constructor(persistIndexedDbWriteBatchOptions: TOIMPersistIndexedDbWriteBatchOptions) {
        this.persistIndexedDbOpenOptions = persistIndexedDbWriteBatchOptions.persistIndexedDbOpenOptions;
    }

    public putTableValue(tableName: string, primaryKey: TOIMPersistIndexedDbPrimaryKey, value: unknown): void {
        const normalizedPrimaryKey = oimNormalizeIndexedDbPrimaryKey(primaryKey);
        this.addTableChange(tableName, objectStoreByTableName => {
            (objectStoreByTableName.get(tableName) as IDBObjectStore).put(value, normalizedPrimaryKey);
        });
    }

    public deleteTableValue(tableName: string, primaryKey: TOIMPersistIndexedDbPrimaryKey): void {
        const normalizedPrimaryKey = oimNormalizeIndexedDbPrimaryKey(primaryKey);
        this.addTableChange(tableName, objectStoreByTableName => {
            (objectStoreByTableName.get(tableName) as IDBObjectStore).delete(normalizedPrimaryKey);
        });
    }

    public clearTable(tableName: string): void {
        this.addTableChange(tableName, objectStoreByTableName => {
            (objectStoreByTableName.get(tableName) as IDBObjectStore).clear();
        });
    }

    public async commit(): Promise<void> {
        const persistWriteBatchChanges = this.persistWriteBatchChanges;
        if (!persistWriteBatchChanges.hasWriteBatchChanges) return;
        const tableNames = Array.from(this.tableNames);
        const database = await oimOpenIndexedDbWithTables({
            persistIndexedDbOpenOptions: this.persistIndexedDbOpenOptions,
            tableNames,
        });
        try {
            await oimIndexedDbTransactionToPromise(database, tableNames, objectStoreByTableName => {
                persistWriteBatchChanges.applyWriteBatchChanges(objectStoreByTableName);
            });
        } finally {
            database.close();
        }
    }

    private addTableChange(tableName: string, tableChange: TOIMIndexedDbTableChange): void {
        this.tableNames.add(tableName);
        this.persistWriteBatchChanges.addWriteBatchChange(tableChange);
    }
}

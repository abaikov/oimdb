import type { IOIMPersistBackend } from '@oimdb/persist';
import { OIMPersistIndexedDbWriteBatch } from './OIMPersistIndexedDbWriteBatch';
import type { TOIMPersistIndexedDbBackendOptions } from './types/TOIMPersistIndexedDbBackendOptions';
import type { TOIMPersistIndexedDbOpenOptions } from './types/TOIMPersistIndexedDbOpenOptions';
import type { TOIMPersistIndexedDbPrimaryKey } from './types/TOIMPersistIndexedDbPrimaryKey';
import type { TOIMPersistIndexedDbTableRecord } from './types/TOIMPersistIndexedDbTableRecord';
import { oimIndexedDbRequestToPromise } from './utils/oimIndexedDbRequestToPromise';
import { oimNormalizeIndexedDbPrimaryKey } from './utils/oimNormalizeIndexedDbPrimaryKey';
import { oimOpenIndexedDb } from './utils/oimOpenIndexedDb';
import { oimReadAllIndexedDbTableRecords } from './utils/oimReadAllIndexedDbTableRecords';

export class OIMPersistIndexedDbBackend implements IOIMPersistBackend<OIMPersistIndexedDbWriteBatch> {
    private readonly persistIndexedDbOpenOptions: TOIMPersistIndexedDbOpenOptions;

    public constructor(persistIndexedDbBackendOptions: TOIMPersistIndexedDbBackendOptions) {
        const indexedDb = persistIndexedDbBackendOptions.indexedDb ?? (globalThis as { indexedDB?: IDBFactory }).indexedDB;
        if (indexedDb === undefined) {
            throw new Error(
                'OIMPersistIndexedDbBackend: globalThis.indexedDB is not available in this environment. Pass indexedDb, '
                + 'for example fake-indexeddb in a test.',
            );
        }
        this.persistIndexedDbOpenOptions = {
            indexedDb,
            databaseName: persistIndexedDbBackendOptions.databaseName,
            databaseVersion: persistIndexedDbBackendOptions.databaseVersion,
        };
    }

    public readTableValue(tableName: string, primaryKey: TOIMPersistIndexedDbPrimaryKey): Promise<unknown> {
        return this.readExistingTable(tableName, () => undefined, database => oimIndexedDbRequestToPromise(
            database.transaction(tableName, 'readonly').objectStore(tableName).get(oimNormalizeIndexedDbPrimaryKey(primaryKey)),
        ) as Promise<unknown>);
    }

    public readTableValues(
        tableName: string, primaryKeys: readonly TOIMPersistIndexedDbPrimaryKey[],
    ): Promise<unknown[]> {
        return this.readExistingTable(tableName, () => primaryKeys.map(() => undefined), database => {
            const objectStore = database.transaction(tableName, 'readonly').objectStore(tableName);
            return Promise.all(primaryKeys.map(primaryKey => oimIndexedDbRequestToPromise(
                objectStore.get(oimNormalizeIndexedDbPrimaryKey(primaryKey)),
            ) as Promise<unknown>));
        });
    }

    public readAllTableRecords(tableName: string): Promise<TOIMPersistIndexedDbTableRecord[] | undefined> {
        return this.readExistingTable<TOIMPersistIndexedDbTableRecord[] | undefined>(
            tableName, () => undefined, database => oimReadAllIndexedDbTableRecords(database, tableName),
        );
    }

    private async readExistingTable<TTableRead>(
        tableName: string, readMissingTable: () => TTableRead, readTable: (database: IDBDatabase) => Promise<TTableRead>,
    ): Promise<TTableRead> {
        const database = await this.openExistingDatabase();
        try {
            if (!database.objectStoreNames.contains(tableName)) return readMissingTable();
            return await readTable(database);
        } finally {
            database.close();
        }
    }

    public createWriteBatch(): OIMPersistIndexedDbWriteBatch {
        return new OIMPersistIndexedDbWriteBatch({ persistIndexedDbOpenOptions: this.persistIndexedDbOpenOptions });
    }

    private openExistingDatabase(): Promise<IDBDatabase> {
        return oimOpenIndexedDb({
            indexedDb: this.persistIndexedDbOpenOptions.indexedDb,
            databaseName: this.persistIndexedDbOpenOptions.databaseName,
        });
    }
}

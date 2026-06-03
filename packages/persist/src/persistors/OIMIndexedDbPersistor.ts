import { TOIMPk } from '@oimdb/core';
import { OIMPersistor, TOIMPersistorOptions } from '../core/OIMPersistor';
import {
    createArrayIndexSourceAdapter,
    createCollectionSourceAdapter,
    createObjectSourceAdapter,
    createOrderedArrayIndexSourceAdapter,
    createSetIndexSourceAdapter,
    TOIMArrayIndexPersistSource,
    TOIMCollectionPersistSnapshot,
    TOIMCollectionPersistSource,
    TOIMIndexPersistSnapshot,
    TOIMObjectPersistSnapshot,
    TOIMObjectPersistSource,
    TOIMOrderedArrayIndexPersistSource,
    TOIMSetIndexPersistSource,
} from '../core/OIMSourceAdapters';
import { OIMPersistResource } from '../core/OIMPersistResource';
import { TOIMPersistStrategy } from '../types/TOIMPersistResource';

export type TOIMIndexedDbPrimaryKey =
    | IDBValidKey
    | Record<string, unknown>
    | readonly unknown[];

export type TOIMIndexedDbPersistorOptions = Omit<
    TOIMPersistorOptions<TOIMIndexedDbRuntime>,
    'storage'
> & {
    databaseName: string;
    databaseVersion?: number;
    indexedDb?: IDBFactory;
};

export type TOIMIndexedDbRuntime = {
    databaseName: string;
    databaseVersion?: number;
    indexedDb: IDBFactory;
    get(tableName: string, primaryKey: TOIMIndexedDbPrimaryKey): Promise<unknown>;
    put(
        tableName: string,
        primaryKey: TOIMIndexedDbPrimaryKey,
        value: unknown
    ): Promise<void>;
    getAll(
        tableName: string
    ): Promise<Array<{ primaryKey: IDBValidKey; value: unknown }>>;
    clear(tableName: string): Promise<void>;
    /**
     * Opens one readwrite transaction across all specified tables, calls fn
     * synchronously with the open stores, then waits for the transaction to
     * complete. Tables that do not yet exist are created automatically.
     */
    batchWrite(
        tableNames: readonly string[],
        fn: (stores: Record<string, IDBObjectStore>) => void
    ): Promise<void>;
};

export type TOIMIndexedDbEntryStrategyOptions = {
    tableName: string;
    primaryKey: TOIMIndexedDbPrimaryKey;
};

export type TOIMIndexedDbRecordsStrategyOptions = {
    tableName: string;
};

/**
 * Extended strategy interface required for atomic batch writes. All built-in
 * IndexedDB strategies implement this. Custom strategies passed to `.using()`
 * fall back to sequential individual writes.
 */
export type TOIMIndexedDbBatchStrategy<TSnapshot> = TOIMPersistStrategy<
    OIMIndexedDbPersistor,
    TSnapshot
> & {
    readonly tableNames: readonly string[];
    writeInTx(
        stores: Record<string, IDBObjectStore>,
        snapshot: TSnapshot
    ): void;
    clearInTx(stores: Record<string, IDBObjectStore>): void;
};

export class OIMIndexedDbPersistor extends OIMPersistor<TOIMIndexedDbRuntime> {
    constructor(options: TOIMIndexedDbPersistorOptions) {
        const indexedDb = options.indexedDb ?? globalThis.indexedDB;
        if (!indexedDb) {
            throw new Error('[OIMPersist]: IndexedDB is not available.');
        }
        super({
            queue: options.queue,
            storage: createIndexedDbRuntime({
                databaseName: options.databaseName,
                databaseVersion: options.databaseVersion,
                indexedDb,
            }),
        });
    }

    public collection<TEntity extends object, TPk extends TOIMPk>(
        collection: TOIMCollectionPersistSource<TEntity, TPk>
    ): OIMIndexedDbCollectionResourceBuilder<TEntity, TPk> {
        return new OIMIndexedDbCollectionResourceBuilder(this, collection);
    }

    public object<TKey extends string, TValue>(
        object: TOIMObjectPersistSource<TKey, TValue>
    ): OIMIndexedDbObjectResourceBuilder<TKey, TValue> {
        return new OIMIndexedDbObjectResourceBuilder(this, object);
    }

    public setIndex<TKey extends TOIMPk, TPk extends TOIMPk>(
        index: TOIMSetIndexPersistSource<TKey, TPk>
    ): OIMIndexedDbIndexResourceBuilder<TKey, TPk> {
        return new OIMIndexedDbIndexResourceBuilder(
            this,
            createSetIndexSourceAdapter(index)
        );
    }

    public arrayIndex<TKey extends TOIMPk, TPk extends TOIMPk>(
        index: TOIMArrayIndexPersistSource<TKey, TPk>
    ): OIMIndexedDbIndexResourceBuilder<TKey, TPk> {
        return new OIMIndexedDbIndexResourceBuilder(
            this,
            createArrayIndexSourceAdapter(index)
        );
    }

    public orderedArrayIndex<TKey extends TOIMPk, TPk extends TOIMPk>(
        index: TOIMOrderedArrayIndexPersistSource<TKey, TPk>
    ): OIMIndexedDbIndexResourceBuilder<TKey, TPk> {
        return new OIMIndexedDbIndexResourceBuilder(
            this,
            createOrderedArrayIndexSourceAdapter(index)
        );
    }

    /**
     * Writes all resources in a single IndexedDB transaction. All table names
     * are collected upfront, one connection is opened, and all writes execute
     * within the same transaction — fully atomic.
     */
    protected override async batchPersist(
        resources: readonly OIMPersistResource<any, any, any>[]
    ): Promise<void> {
        const batchItems: Array<{
            strategy: TOIMIndexedDbBatchStrategy<unknown>;
            snapshot: unknown;
            resource: OIMPersistResource<any, any, any>;
        }> = [];
        const fallbackItems: Array<{
            strategy: TOIMPersistStrategy<any, any>;
            snapshot: unknown;
            resource: OIMPersistResource<any, any, any>;
        }> = [];

        for (const resource of resources) {
            const snapshot = resource.takeSnapshot();
            const strategy = resource.strategy as TOIMIndexedDbBatchStrategy<unknown>;
            if (typeof strategy.tableNames !== 'undefined') {
                batchItems.push({ strategy, snapshot, resource });
            } else {
                fallbackItems.push({ strategy: resource.strategy, snapshot, resource });
            }
        }

        if (batchItems.length > 0) {
            const allTables = new Set<string>();
            for (const { strategy } of batchItems) {
                for (const t of strategy.tableNames) allTables.add(t);
            }
            try {
                await this.storage.batchWrite(Array.from(allTables), stores => {
                    for (const { strategy, snapshot } of batchItems) {
                        strategy.writeInTx(stores, snapshot);
                    }
                });
            } catch (error) {
                if (this.onError) {
                    for (const { resource } of batchItems) {
                        this.onError(error, { resource, operation: 'persist' });
                    }
                } else {
                    throw error;
                }
            }
        }

        for (const { strategy, snapshot, resource } of fallbackItems) {
            try {
                await strategy.write(this, snapshot);
            } catch (error) {
                if (this.onError) {
                    this.onError(error, { resource, operation: 'persist' });
                } else {
                    throw error;
                }
            }
        }
    }
}

export function createIndexedDbPersistor(
    options: TOIMIndexedDbPersistorOptions
): OIMIndexedDbPersistor {
    return new OIMIndexedDbPersistor(options);
}

export class OIMIndexedDbCollectionResourceBuilder<
    TEntity extends object,
    TPk extends TOIMPk,
> {
    constructor(
        private readonly persistor: OIMIndexedDbPersistor,
        private readonly collection: TOIMCollectionPersistSource<TEntity, TPk>
    ) {}

    public entry(options: TOIMIndexedDbEntryStrategyOptions) {
        return this.persistor.addResource(new OIMPersistResource({
            source: createCollectionSourceAdapter(this.collection),
            strategy: createIndexedDbEntryStrategy<TOIMCollectionPersistSnapshot<TPk, TEntity>>(options),
        }));
    }

    public records(options: TOIMIndexedDbRecordsStrategyOptions) {
        return this.persistor.addResource(new OIMPersistResource({
            source: createCollectionSourceAdapter(this.collection),
            strategy: createIndexedDbCollectionRecordsStrategy<TPk, TEntity>(options),
        }));
    }

    public using<TPersistedSnapshot>(strategy: TOIMPersistStrategy<OIMIndexedDbPersistor, TPersistedSnapshot>) {
        return this.persistor.addResource(new OIMPersistResource({
            source: createCollectionSourceAdapter(this.collection),
            strategy,
        }));
    }
}

export class OIMIndexedDbObjectResourceBuilder<TKey extends string, TValue> {
    constructor(
        private readonly persistor: OIMIndexedDbPersistor,
        private readonly object: TOIMObjectPersistSource<TKey, TValue>
    ) {}

    public entry(options: TOIMIndexedDbEntryStrategyOptions) {
        return this.persistor.addResource(new OIMPersistResource({
            source: createObjectSourceAdapter(this.object),
            strategy: createIndexedDbEntryStrategy<TOIMObjectPersistSnapshot<TKey, TValue>>(options),
        }));
    }
}

export class OIMIndexedDbIndexResourceBuilder<TKey extends TOIMPk, TPk extends TOIMPk> {
    constructor(
        private readonly persistor: OIMIndexedDbPersistor,
        private readonly source: ReturnType<typeof createSetIndexSourceAdapter<TKey, TPk>>
    ) {}

    public entry(options: TOIMIndexedDbEntryStrategyOptions) {
        return this.persistor.addResource(new OIMPersistResource({
            source: this.source,
            strategy: createIndexedDbEntryStrategy<TOIMIndexPersistSnapshot<TKey, TPk>>(options),
        }));
    }
}

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

function normalizePrimaryKey(primaryKey: TOIMIndexedDbPrimaryKey): IDBValidKey {
    if (
        typeof primaryKey === 'string' ||
        typeof primaryKey === 'number' ||
        primaryKey instanceof Date ||
        Array.isArray(primaryKey)
    ) {
        return primaryKey as IDBValidKey;
    }
    return JSON.stringify(primaryKey);
}

function createIndexedDbRuntime(options: {
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
                await transactionToPromise(db, [tableName], store => {
                    if (value === undefined) {
                        store[tableName].delete(normalizePrimaryKey(primaryKey));
                    } else {
                        store[tableName].put(value, normalizePrimaryKey(primaryKey));
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

async function openDatabaseWithTable(
    options: {
        databaseName: string;
        databaseVersion?: number;
        indexedDb: IDBFactory;
    },
    tableName: string
): Promise<IDBDatabase> {
    return openDatabaseWithTables(options, [tableName]);
}

async function openDatabaseWithTables(
    options: {
        databaseName: string;
        databaseVersion?: number;
        indexedDb: IDBFactory;
    },
    tableNames: readonly string[]
): Promise<IDBDatabase> {
    const db = await openDatabase(options.indexedDb, options.databaseName);
    const missing = tableNames.filter(t => !db.objectStoreNames.contains(t));
    if (missing.length === 0) return db;

    const nextVersion = Math.max(options.databaseVersion ?? 1, db.version + 1);
    db.close();
    return openDatabase(
        options.indexedDb,
        options.databaseName,
        nextVersion,
        database => {
            for (const t of missing) {
                if (!database.objectStoreNames.contains(t)) {
                    database.createObjectStore(t);
                }
            }
        }
    );
}

function openDatabase(
    indexedDb: IDBFactory,
    databaseName: string,
    version?: number,
    upgrade?: (db: IDBDatabase) => void
): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDb.open(databaseName, version);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = () => upgrade?.(request.result);
    });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
    });
}

function transactionToPromise(
    db: IDBDatabase,
    tableNames: readonly string[],
    run: (stores: Record<string, IDBObjectStore>) => void
): Promise<void> {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(tableNames as string[], 'readwrite');
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();
        const stores: Record<string, IDBObjectStore> = {};
        for (const name of tableNames) {
            stores[name] = transaction.objectStore(name);
        }
        run(stores);
    });
}

function readAllRecords(
    db: IDBDatabase,
    tableName: string
): Promise<Array<{ primaryKey: IDBValidKey; value: unknown }>> {
    return new Promise((resolve, reject) => {
        const records: Array<{ primaryKey: IDBValidKey; value: unknown }> = [];
        const request = db
            .transaction(tableName, 'readonly')
            .objectStore(tableName)
            .openCursor();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) {
                resolve(records);
                return;
            }
            records.push({
                primaryKey: cursor.primaryKey,
                value: cursor.value,
            });
            cursor.continue();
        };
    });
}

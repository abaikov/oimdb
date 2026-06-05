import { TOIMIndexedDbPrimaryKey } from './TOIMIndexedDbPrimaryKey';

export type TOIMIndexedDbRuntime = {
    databaseName: string;
    databaseVersion?: number;
    indexedDb: IDBFactory;
    get(
        tableName: string,
        primaryKey: TOIMIndexedDbPrimaryKey
    ): Promise<unknown>;
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

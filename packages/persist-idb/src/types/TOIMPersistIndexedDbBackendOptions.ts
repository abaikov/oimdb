export type TOIMPersistIndexedDbBackendOptions = {
    readonly databaseName: string;
    readonly databaseVersion?: number | undefined;
    readonly indexedDb?: IDBFactory | undefined;
};

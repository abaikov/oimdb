export type TOIMPersistIndexedDbOpenOptions = {
    readonly indexedDb: IDBFactory;
    readonly databaseName: string;
    readonly databaseVersion?: number | undefined;
};

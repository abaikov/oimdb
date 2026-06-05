export type TOIMIndexedDbPrimaryKey =
    | IDBValidKey
    | Record<string, unknown>
    | readonly unknown[];

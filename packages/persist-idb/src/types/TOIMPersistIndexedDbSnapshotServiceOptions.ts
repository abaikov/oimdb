import type { TOIMPersistIndexedDbPrimaryKey } from './TOIMPersistIndexedDbPrimaryKey';

export type TOIMPersistIndexedDbSnapshotServiceOptions = {
    readonly tableName: string;
    readonly primaryKey: TOIMPersistIndexedDbPrimaryKey;
};

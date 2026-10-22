import type { TOIMPersistIndexedDbPrimaryKey } from './TOIMPersistIndexedDbPrimaryKey';

export type TOIMPersistIndexedDbSnapshotStrategyOptions = {
    readonly tableName: string;
    readonly primaryKey: TOIMPersistIndexedDbPrimaryKey;
};

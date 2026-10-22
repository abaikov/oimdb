import type { TOIMPersistIndexedDbOpenOptions } from './TOIMPersistIndexedDbOpenOptions';

export type TOIMPersistIndexedDbOpenWithTablesOptions = {
    readonly persistIndexedDbOpenOptions: TOIMPersistIndexedDbOpenOptions;
    readonly tableNames: readonly string[];
};

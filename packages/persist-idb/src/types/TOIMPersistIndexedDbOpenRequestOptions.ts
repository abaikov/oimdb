import type { TOIMPersistIndexedDbOpenOptions } from './TOIMPersistIndexedDbOpenOptions';

export type TOIMPersistIndexedDbOpenRequestOptions = TOIMPersistIndexedDbOpenOptions & {
    readonly onUpgradeNeeded?: ((database: IDBDatabase) => void) | undefined;
};

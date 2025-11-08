import { TOIMPk } from '@oimdb/core';

/**
 * Async interface for Index Store.
 * All methods return Promises for asynchronous operations.
 * Stores index data (key-to-PKs mappings), not the indexes themselves.
 */
export interface IOIMIndexStoreAsync<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
> {
    setOneByKey(key: TKey, pks: Set<TPk>): Promise<void>;

    removeOneByKey(key: TKey): Promise<void>;

    removeManyByKeys(keys: readonly TKey[]): Promise<void>;

    getOneByKey(key: TKey): Promise<Set<TPk> | undefined>;

    getManyByKeys(keys: readonly TKey[]): Promise<Map<TKey, Set<TPk>>>;

    getAllKeys(): Promise<TKey[]>;

    getAll(): Promise<Map<TKey, Set<TPk>>>;

    countAll(): Promise<number>;

    clear(): Promise<void>;
}


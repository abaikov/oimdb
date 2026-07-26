import { TOIMPk } from '@oimdb/core';

/**
 * Async interface for Collection Store.
 * All methods return Promises for asynchronous operations.
 */
export interface IOIMCollectionStoreAsync<
    TEntity extends object,
    TPk extends TOIMPk,
> {
    setOneByPk(pk: TPk, entity: TEntity): Promise<void>;

    removeOneByPk(pk: TPk): Promise<void>;

    removeManyByPks(pks: readonly TPk[]): Promise<void>;

    getOneByPk(pk: TPk): Promise<TEntity | undefined>;

    /** Length-aligned with `pks`; `undefined` wherever a pk has no entity (mirrors the sync store). */
    getManyByPks(pks: readonly TPk[]): Promise<(TEntity | undefined)[]>;

    /** Holes filtered out — may be SHORTER than `pks`. Deliberate; see `@oimdb/core`. */
    getManyByPksCompact(pks: readonly TPk[]): Promise<TEntity[]>;

    getAll(): Promise<TEntity[]>;

    getAllPks(): Promise<TPk[]>;

    countAll(): Promise<number>;

    clear(): Promise<void>;
}


import type { TOIMStoreKey } from '@oimdb/core';

export type TOIMReduxDefaultCollectionState<TEntity, TPk extends TOIMStoreKey> = {
    entities: Record<TPk, TEntity>;
    ids: TPk[];
};

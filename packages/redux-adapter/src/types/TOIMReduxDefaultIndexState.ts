import type { TOIMStoreKey } from '@oimdb/core';

/** `entities` is keyed by the raw index key; each entry holds the row pks. */
export type TOIMReduxDefaultIndexState<
    TIndexKey extends TOIMStoreKey,
    TPk extends TOIMStoreKey,
> = {
    entities: Record<TIndexKey, { id: TIndexKey; ids: TPk[] }>;
};

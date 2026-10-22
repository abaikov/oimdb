import type { TOIMStoreKey } from '@oimdb/core';

/** No keys — one deduped list of pks. */
export type TOIMReduxDefaultGlobalIndexState<TPk extends TOIMStoreKey> = {
    ids: TPk[];
};

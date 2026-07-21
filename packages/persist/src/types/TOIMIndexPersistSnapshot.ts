import { TOIMKey } from '@oimdb/core';

export type TOIMIndexPersistSnapshot<
    TKey extends TOIMKey,
    TPk extends TOIMKey,
> = {
    buckets: Array<{
        key: TKey;
        pks: TPk[];
    }>;
};

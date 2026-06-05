import { TOIMPk } from '@oimdb/core';

export type TOIMIndexPersistSnapshot<
    TKey extends TOIMPk,
    TPk extends TOIMPk,
> = {
    buckets: Array<{
        key: TKey;
        pks: TPk[];
    }>;
};

import { TOIMKey } from '@oimdb/core';

export type TOIMCollectionPersistSnapshot<TPk extends TOIMKey, TEntity> = {
    records: Array<{
        pk: TPk;
        value: TEntity;
    }>;
};

import { TOIMPk } from '@oimdb/core';

export type TOIMCollectionPersistSnapshot<TPk extends TOIMPk, TEntity> = {
    records: Array<{
        pk: TPk;
        value: TEntity;
    }>;
};

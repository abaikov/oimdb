import {
    TOIMPkSelector,
    TOIMPk,
    TOIMEntityUpdater,
} from '@oimdb/core';
import { IOIMCollectionStoreAsync } from '../interfaces/IOIMCollectionStoreAsync';

export type TOIMCollectionOptionsAsync<
    TEntity extends object,
    TPk extends TOIMPk,
> = {
    selectPk?: TOIMPkSelector<TEntity, TPk>;
    store: IOIMCollectionStoreAsync<TEntity, TPk>;
    updateEntity?: TOIMEntityUpdater<TEntity>;
};


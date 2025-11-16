import { TOIMPk } from '@oimdb/core';

/**
 * Default Redux state structure for collections (RTK Entity Adapter style)
 */
export type TOIMDBReduxDefaultCollectionState<TEntity, TPk extends TOIMPk> = {
    entities: Record<TPk, TEntity>;
    ids: TPk[];
};

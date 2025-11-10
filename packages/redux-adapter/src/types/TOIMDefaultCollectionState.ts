import { TOIMPk } from '@oimdb/core';

/**
 * Default Redux state structure for collections (RTK Entity Adapter style)
 */
export type TOIMDefaultCollectionState<TEntity, TPk extends TOIMPk> = {
    entities: Record<TPk, TEntity>;
    ids: TPk[];
};

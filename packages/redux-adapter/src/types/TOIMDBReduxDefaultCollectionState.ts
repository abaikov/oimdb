import { TOIMKey } from '@oimdb/core';
import { TOIMReduxKey } from './TOIMReduxKey';

/**
 * Default Redux state structure for collections (RTK Entity Adapter style).
 * `entities` is keyed by the string PK (a primitive PK as-is — unchanged for
 * existing users; a composite PK path encoded via an `IOIMPkCodec`); `ids` holds
 * the raw PKs (arrays for a composite PK).
 */
export type TOIMDBReduxDefaultCollectionState<TEntity, TPk extends TOIMKey> = {
    entities: Record<TOIMReduxKey<TPk>, TEntity>;
    ids: TPk[];
};

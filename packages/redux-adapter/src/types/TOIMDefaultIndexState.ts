import { TOIMPk } from '@oimdb/core';

/**
 * Default Redux state structure for indexes
 */
export type TOIMDefaultIndexState<
    TIndexKey extends TOIMPk,
    TPk extends TOIMPk,
> = {
    entities: Record<TIndexKey, { key: TIndexKey; ids: TPk[] }>;
};

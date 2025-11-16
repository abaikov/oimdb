import { TOIMPk } from '@oimdb/core';

/**
 * Default Redux state structure for indexes
 */
export type TOIMDBReduxDefaultIndexState<
    TIndexKey extends TOIMPk,
    TPk extends TOIMPk,
> = {
    entities: Record<TIndexKey, { id: TIndexKey; ids: TPk[] }>;
};

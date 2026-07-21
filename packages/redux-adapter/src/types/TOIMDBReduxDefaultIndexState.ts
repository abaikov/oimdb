import { TOIMKey } from '@oimdb/core';
import { TOIMReduxKey } from './TOIMReduxKey';

/**
 * Default Redux state structure for indexes. `entities` is keyed by the string
 * index key; each holds the raw member PKs (`ids`, arrays for a composite PK).
 */
export type TOIMDBReduxDefaultIndexState<
    TIndexKey extends TOIMKey,
    TPk extends TOIMKey,
> = {
    entities: Record<
        TOIMReduxKey<TIndexKey>,
        { id: TIndexKey; ids: TPk[] }
    >;
};

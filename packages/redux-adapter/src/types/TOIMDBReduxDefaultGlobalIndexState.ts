import { TOIMKey } from '@oimdb/core';

/**
 * Default Redux state structure for a keyless "Global" (whole-collection) index.
 * There are no keys — just the single ordered/deduped list of pks.
 */
export type TOIMDBReduxDefaultGlobalIndexState<TPk extends TOIMKey> = {
    ids: TPk[];
};

import {
    OIMGlobalIndexArrayBased,
    OIMGlobalIndexSetBased,
    OIMReactiveGlobalIndexArrayBased,
    OIMReactiveGlobalIndexSetBased,
    TOIMPk,
} from '@oimdb/core';

/**
 * Either shape of a reactive keyless "Global" (whole-collection) index. Both
 * expose keyless `getPks()` / `subscribe()`, which is all the adapter needs.
 */
export type TOIMDBReduxGlobalIndex<TPk extends TOIMPk> =
    | OIMReactiveGlobalIndexArrayBased<TPk, OIMGlobalIndexArrayBased<TPk>>
    | OIMReactiveGlobalIndexSetBased<TPk, OIMGlobalIndexSetBased<TPk>>;

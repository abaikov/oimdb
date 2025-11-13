import {
    OIMReactiveIndexSetBased,
    OIMReactiveIndexArrayBased,
    OIMIndexSetBased,
    OIMIndexArrayBased,
    TOIMPk,
} from '@oimdb/core';

/**
 * Mapper function for converting index state to Redux state
 * @param index - The reactive index
 * @param updatedKeys - Set of index keys that were updated
 * @param currentState - Current Redux state (undefined on first call)
 * @returns New Redux state
 */
export type TOIMIndexMapper<
    TIndexKey extends TOIMPk,
    TPk extends TOIMPk,
    TState,
> = (
    index:
        | OIMReactiveIndexSetBased<
              TIndexKey,
              TPk,
              OIMIndexSetBased<TIndexKey, TPk>
          >
        | OIMReactiveIndexArrayBased<
              TIndexKey,
              TPk,
              OIMIndexArrayBased<TIndexKey, TPk>
          >,
    updatedKeys: Set<TIndexKey>,
    currentState: TState | undefined
) => TState;

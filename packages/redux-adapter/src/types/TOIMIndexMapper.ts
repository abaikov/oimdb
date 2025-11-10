import { OIMReactiveIndex, OIMIndex, TOIMPk } from '@oimdb/core';

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
    index: OIMReactiveIndex<TIndexKey, TPk, OIMIndex<TIndexKey, TPk>>,
    updatedKeys: Set<TIndexKey>,
    currentState: TState | undefined
) => TState;

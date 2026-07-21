import { TOIMKey } from '@oimdb/core';
import { TOIMDBReduxGlobalIndex } from './TOIMDBReduxGlobalIndex';

/**
 * Mapper for converting a keyless Global index to Redux state.
 * @param index - The reactive Global index
 * @param currentState - Current Redux state (undefined on first call)
 * @returns New Redux state
 */
export type TOIMDBReduxGlobalIndexMapper<TPk extends TOIMKey, TState> = (
    index: TOIMDBReduxGlobalIndex<TPk>,
    currentState: TState | undefined
) => TState;

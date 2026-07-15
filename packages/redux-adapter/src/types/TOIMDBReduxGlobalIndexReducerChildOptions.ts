import { Reducer, Action } from 'redux';
import { TOIMPk } from '@oimdb/core';
import { TOIMDBReduxGlobalIndex } from './TOIMDBReduxGlobalIndex';

/**
 * Options for a child reducer that handles custom actions and syncs changes
 * back to a keyless Global index.
 */
export type TOIMDBReduxGlobalIndexReducerChildOptions<
    TPk extends TOIMPk,
    TState,
> = {
    reducer: Reducer<TState, Action> | Reducer<TState | undefined, Action>;

    /**
     * Extract the pk list from Redux state and sync it back to the Global index.
     * If omitted, the default implementation is used for
     * `TOIMDBReduxDefaultGlobalIndexState` (`{ ids }`).
     */
    extractGlobalIndexState?: (
        prevState: TState | undefined,
        nextState: TState,
        index: TOIMDBReduxGlobalIndex<TPk>
    ) => void;
};

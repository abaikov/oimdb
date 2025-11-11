import { Reducer, Action } from 'redux';
import { TOIMPk, OIMReactiveIndex, OIMIndex } from '@oimdb/core';

/**
 * Options for child reducer that can handle custom actions
 * and sync changes back to OIMDB index
 */
export type TOIMIndexReducerChildOptions<
    TIndexKey extends TOIMPk,
    TPk extends TOIMPk,
    TState,
> = {
    /**
     * Child reducer that handles custom actions
     * Should return new state when action is handled, or return current state unchanged
     * Must handle undefined state (for Redux combineReducers compatibility)
     */
    reducer: Reducer<TState | undefined, Action>;

    /**
     * Function to extract index state from Redux state and sync it to OIMDB index
     * Should directly update the index using addPks/removePks
     * If not provided, default implementation will be used for TOIMDefaultIndexState
     * @param prevState - Previous Redux state (undefined on first call)
     * @param nextState - New Redux state after child reducer processed action
     * @param index - The OIMDB index to sync with
     */
    extractIndexState?: (
        prevState: TState | undefined,
        nextState: TState,
        index: OIMReactiveIndex<TIndexKey, TPk, OIMIndex<TIndexKey, TPk>>
    ) => void;
};

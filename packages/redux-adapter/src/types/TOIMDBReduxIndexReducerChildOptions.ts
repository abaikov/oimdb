import { Reducer, Action } from 'redux';
import {
    TOIMPk,
    OIMReactiveIndexSetBased,
    OIMReactiveIndexArrayBased,
    OIMIndexSetBased,
    OIMIndexArrayBased,
} from '@oimdb/core';

/**
 * Options for child reducer that can handle custom actions
 * and sync changes back to OIMDB index
 */
export type TOIMDBReduxIndexReducerChildOptions<
    TIndexKey extends TOIMPk,
    TPk extends TOIMPk,
    TState,
> = {
    /**
     * Child reducer that handles custom actions
     * Should return new state when action is handled, or return current state unchanged
     * Can be either Reducer<TState, Action> (RTK slice style) or Reducer<TState | undefined, Action>
     * If reducer doesn't accept undefined, factory will handle undefined state automatically
     */
    reducer: Reducer<TState, Action> | Reducer<TState | undefined, Action>;

    /**
     * Function to extract index state from Redux state and sync it to OIMDB index
     * Should directly update a collection-bound PK index using addPks/removePks
     * (for SetBased) or setPks (for ArrayBased)
     * If not provided, default implementation will be used for TOIMDBReduxDefaultIndexState
     * @param prevState - Previous Redux state (undefined on first call)
     * @param nextState - New Redux state after child reducer processed action
     * @param index - The OIMDB index to sync with
     */
    extractIndexState?: (
        prevState: TState | undefined,
        nextState: TState,
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
              >
    ) => void;
};

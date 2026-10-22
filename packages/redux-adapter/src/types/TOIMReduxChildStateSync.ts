import type { Action, Reducer } from 'redux';

export type TOIMReduxChildStateSync<TState> = {
    reducer: Reducer<TState, Action> | Reducer<TState | undefined, Action>;
    applyChildState(previousState: TState, childState: TState): void;
};

import type { Action } from 'redux';
import type { TOIMReduxChildStateSync } from './TOIMReduxChildStateSync';

export type TOIMReduxChildAwareReducerOptions<TState> = {
    /** `undefined` declines to initialize, which is what keeps a non-init action RTK-compatible. */
    readInitialState(action: Action): TState | undefined;
    readUpdatedState(previousState: TState): TState;
    childSync?: TOIMReduxChildStateSync<TState> | undefined;
};

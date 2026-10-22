import type { Action } from 'redux';
import { EOIMReduxReducerActionType } from '../enums/EOIMReduxReducerActionType';
import type { TOIMReduxChildAwareReducerOptions } from '../types/TOIMReduxChildAwareReducerOptions';

export class OIMReduxChildAwareReducer<TState> {
    private isSyncingFromChild = false;

    constructor(
        private readonly childAwareReducerOptions: TOIMReduxChildAwareReducerOptions<TState>
    ) {}

    public readonly reduce = (
        state: TState | undefined,
        action: Action
    ): TState | undefined => {
        if (state === undefined) {
            return this.childAwareReducerOptions.readInitialState(action);
        }

        if (action.type === EOIMReduxReducerActionType.UPDATE) {
            if (this.isSyncingFromChild) return state;
            return this.childAwareReducerOptions.readUpdatedState(state);
        }

        const { childSync } = this.childAwareReducerOptions;
        if (childSync === undefined) return state;

        const childState = childSync.reducer(state, action);
        if (childState !== state && childState !== undefined) {
            // Raised across USER code, so lowered in a `finally`; a throw that
            // leaves it up freezes the store forever. The error is NOT caught.
            this.isSyncingFromChild = true;
            try {
                childSync.applyChildState(state, childState);
            } finally {
                this.isSyncingFromChild = false;
            }
        }
        return childState;
    };
}

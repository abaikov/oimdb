import type { Reducer, Action } from 'redux';
import type { TOIMBucketSlot, TOIMDefaultSlotStore, TOIMEntitySlot, TOIMStoreKey } from '@oimdb/core';
import type { TOIMReduxGlobalIndex } from './TOIMReduxGlobalIndex';

export type TOIMReduxGlobalIndexReducerChildOptions<
    TPk extends TOIMStoreKey,
    TState,
    TEntity extends object,
    TEntityStore = TOIMDefaultSlotStore<TOIMStoreKey, TOIMEntitySlot<TEntity, TOIMStoreKey>>,
    TBucketStore = TOIMDefaultSlotStore<TOIMStoreKey, TOIMBucketSlot<unknown, TOIMStoreKey>>,
> = {
    reducer: Reducer<TState, Action> | Reducer<TState | undefined, Action>;

    /** Omitted: the default sync-back for `{ ids }` runs instead. */
    extractGlobalIndexState?: (
        prevState: TState | undefined,
        nextState: TState,
        globalIndex: TOIMReduxGlobalIndex<TPk, TEntity, TEntityStore, TBucketStore>
    ) => void;
};

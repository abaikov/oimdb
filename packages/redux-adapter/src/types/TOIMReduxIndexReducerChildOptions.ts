import type { Reducer, Action } from 'redux';
import type { TOIMBucketSlot, TOIMDefaultSlotStore, TOIMEntitySlot, TOIMStoreKey } from '@oimdb/core';
import type { TOIMReduxKeyedIndex } from './TOIMReduxKeyedIndex';

export type TOIMReduxIndexReducerChildOptions<
    TIndexKey extends TOIMStoreKey,
    TPk extends TOIMStoreKey,
    TState,
    TEntity extends object,
    TBucketStore = TOIMDefaultSlotStore<TOIMStoreKey, TOIMBucketSlot<unknown, TOIMStoreKey>>,
    TEntityStore = TOIMDefaultSlotStore<TOIMStoreKey, TOIMEntitySlot<TEntity, TOIMStoreKey>>,
> = {
    reducer: Reducer<TState, Action> | Reducer<TState | undefined, Action>;

    /** Omitted: the default sync-back for `TOIMReduxDefaultIndexState` runs instead. */
    extractIndexState?: (
        prevState: TState | undefined,
        nextState: TState,
        keyedIndex: TOIMReduxKeyedIndex<TIndexKey, TPk, TEntity, TBucketStore, TEntityStore>
    ) => void;
};

import type { TOIMBucketSlot, TOIMDefaultSlotStore, TOIMEntitySlot, TOIMStoreKey } from '@oimdb/core';
import type { TOIMReduxKeyedIndex } from './TOIMReduxKeyedIndex';

/** `currentState` is undefined on the first call. */
export type TOIMReduxIndexMapper<
    TIndexKey extends TOIMStoreKey,
    TPk extends TOIMStoreKey,
    TState,
    TEntity extends object,
    TBucketStore = TOIMDefaultSlotStore<TOIMStoreKey, TOIMBucketSlot<unknown, TOIMStoreKey>>,
    TEntityStore = TOIMDefaultSlotStore<TOIMStoreKey, TOIMEntitySlot<TEntity, TOIMStoreKey>>,
> = (
    keyedIndex: TOIMReduxKeyedIndex<TIndexKey, TPk, TEntity, TBucketStore, TEntityStore>,
    updatedKeys: Set<TIndexKey>,
    currentState: TState | undefined
) => TState;

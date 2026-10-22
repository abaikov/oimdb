import type { TOIMBucketSlot, TOIMDefaultSlotStore, TOIMEntitySlot, TOIMStoreKey } from '@oimdb/core';
import type { TOIMReduxGlobalIndex } from './TOIMReduxGlobalIndex';

/** `currentState` is undefined on the first call. */
export type TOIMReduxGlobalIndexMapper<
    TPk extends TOIMStoreKey,
    TState,
    TEntity extends object,
    TEntityStore = TOIMDefaultSlotStore<TOIMStoreKey, TOIMEntitySlot<TEntity, TOIMStoreKey>>,
    TBucketStore = TOIMDefaultSlotStore<TOIMStoreKey, TOIMBucketSlot<unknown, TOIMStoreKey>>,
> = (
    globalIndex: TOIMReduxGlobalIndex<TPk, TEntity, TEntityStore, TBucketStore>,
    currentState: TState | undefined
) => TState;

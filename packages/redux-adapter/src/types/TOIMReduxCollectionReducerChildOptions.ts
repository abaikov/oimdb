import type { Reducer, Action } from 'redux';
import type { TOIMBucketSlot, TOIMDefaultSlotStore, TOIMEntitySlot, TOIMStoreKey, TOIMStoreSlot } from '@oimdb/core';
import type { TOIMReduxLinkedIndex } from './TOIMReduxLinkedIndex';
import type { TOIMReduxEntityCollectionService } from './TOIMReduxEntityCollectionService';

export type TOIMReduxCollectionReducerChildOptions<
    TEntity extends object,
    TPk extends TOIMStoreKey,
    TState,
    TStore = TOIMDefaultSlotStore<TOIMStoreKey, TOIMEntitySlot<TEntity, TOIMStoreKey>>,
    TLinkedBucketStore = TOIMDefaultSlotStore<TOIMStoreKey, TOIMBucketSlot<unknown, TOIMStoreKey>>,
    TLinkedEntityStore = TOIMDefaultSlotStore<TOIMStoreKey, TOIMEntitySlot<object, TOIMStoreKey>>,
> = {
    reducer: Reducer<TState, Action> | Reducer<TState | undefined, Action>;

    /** Omitted: the default sync-back for `TOIMReduxDefaultCollectionState` runs instead. */
    extractEntities?: (
        prevState: TState | undefined,
        nextState: TState,
        entityService: TOIMReduxEntityCollectionService<TEntity, TStore>,
        entityStoreSlot: TOIMStoreSlot<TStore, TOIMEntitySlot<TEntity, TOIMStoreKey>, Partial<TEntity>>,
        keyOf: (entity: TEntity) => TPk
    ) => void;

    /** Defaults to reading `.id`. */
    keyOf?: (entity: TEntity) => TPk;

    linkedIndexes?: ReadonlyArray<TOIMReduxLinkedIndex<TEntity, object, TLinkedBucketStore, TLinkedEntityStore>>;
};

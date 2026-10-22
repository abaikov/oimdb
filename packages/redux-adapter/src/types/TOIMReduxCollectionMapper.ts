import type { TOIMDefaultSlotStore, TOIMEntitySlot, TOIMStoreKey, TOIMStoreSlot } from '@oimdb/core';
import type { TOIMReduxEntityCollectionService } from './TOIMReduxEntityCollectionService';

// `TPk` is what the REDUX side is keyed by, not the population; `currentState`
// is undefined on the first call.
export type TOIMReduxCollectionMapper<
    TEntity extends object,
    TPk extends TOIMStoreKey,
    TState,
    TStore = TOIMDefaultSlotStore<TOIMStoreKey, TOIMEntitySlot<TEntity, TOIMStoreKey>>,
> = (
    entityService: TOIMReduxEntityCollectionService<TEntity, TStore>,
    entityStoreSlot: TOIMStoreSlot<TStore, TOIMEntitySlot<TEntity, TOIMStoreKey>, Partial<TEntity>>,
    updatedKeys: Set<TPk>,
    currentState: TState | undefined
) => TState;

import type { TOIMDefaultSlotStore, TOIMEntitySlot, TOIMStoreKey, TOIMStoreSlot } from '@oimdb/core';
import type { TOIMPersistEntityCollectionService } from '../types/TOIMPersistEntityCollectionService';

export function oimFindEntitySlotsByKeys<
    TKey extends TOIMStoreKey, TEntity extends object, TStore = TOIMDefaultSlotStore<TKey, TOIMEntitySlot<TEntity, TKey>>,
>(
    entityCollectionService: TOIMPersistEntityCollectionService<TKey, TEntity, TStore>,
    entityStoreSlot: TOIMStoreSlot<TStore, TOIMEntitySlot<TEntity, TKey>, Partial<TEntity>>,
    keys: readonly TKey[],
): Set<TOIMEntitySlot<TEntity, TKey>> {
    const entitySlots = new Set<TOIMEntitySlot<TEntity, TKey>>();
    for (let i = 0; i < keys.length; i++) {
        const entitySlot = entityCollectionService.findSlotByKey(entityStoreSlot, keys[i]);
        if (entitySlot !== undefined) entitySlots.add(entitySlot);
    }
    return entitySlots;
}

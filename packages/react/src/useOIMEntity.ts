import type { OIMSlotCollectionService, TOIMEntitySlot, TOIMStoreKey, TOIMStoreSlot } from '@oimdb/core';
import { useOIMSlotByKey } from './useOIMSlotByKey';

export function useOIMEntity<TEntity extends object, TKey = TOIMStoreKey, TStore = unknown>(
    entityCollectionService: Pick<
        OIMSlotCollectionService<TKey, TOIMEntitySlot<TEntity, TKey>, TStore, unknown>, 'getSlotByKey' | 'holdSlotByKey'
    >,
    entityStoreSlot: TOIMStoreSlot<TStore, TOIMEntitySlot<TEntity, TKey>>,
    key: TKey,
): TEntity | undefined {
    return useOIMSlotByKey('useOIMEntity', entityCollectionService, entityStoreSlot, key).entity;
}

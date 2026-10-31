import type { OIMSlotCollectionService, TOIMEntitySlot, TOIMStoreKey, TOIMStoreSlot } from '@oimdb/core';
import { useOIMSlotByKey } from './useOIMSlotByKey';

export function useOIMEntity<TEntity extends object, TKey extends NonNullable<unknown> = TOIMStoreKey, TStore = unknown>(
    entityStoreSlot: TOIMStoreSlot<
        TStore, TOIMEntitySlot<TEntity, TKey>, unknown,
        Pick<OIMSlotCollectionService<TKey, TOIMEntitySlot<TEntity, TKey>, TStore, unknown>, 'getSlotByKey' | 'holdSlotByKey'>
    >,
    key: TKey,
): TEntity | undefined {
    return useOIMSlotByKey('useOIMEntity', entityStoreSlot, key).entity;
}

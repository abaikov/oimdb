import type { TOIMEntitySlot, TOIMStoreKey, TOIMStoreSlot } from '@oimdb/core';
import type { TOIMPersistEntityCollectionService } from '../types/TOIMPersistEntityCollectionService';

export function clearOIMEntitySlots<TKey extends TOIMStoreKey, TEntity extends object, TStore>(
    entityCollectionService: TOIMPersistEntityCollectionService<TKey, TEntity, TStore>,
    entityStoreSlot: TOIMStoreSlot<TStore, TOIMEntitySlot<TEntity, TKey>, Partial<TEntity>>,
    entitySlots: Iterable<TOIMEntitySlot<TEntity, TKey>>,
): void {
    const entityContentService = entityCollectionService.slotContentService;
    entityCollectionService.writeInBatch(entityStoreSlot, () => {
        for (const entitySlot of entitySlots) entityContentService.clearSlotContent(entitySlot);
    });
}

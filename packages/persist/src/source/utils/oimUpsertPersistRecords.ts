import type { TOIMEntitySlot, TOIMStoreKey, TOIMStoreSlot } from '@oimdb/core';
import type { TOIMPersistEntityCollectionService } from '../types/TOIMPersistEntityCollectionService';
import type { TOIMPersistRecord } from '../types/TOIMPersistRecord';

export function oimUpsertPersistRecords<TKey extends TOIMStoreKey, TEntity extends object, TStore>(
    entityCollectionService: TOIMPersistEntityCollectionService<TKey, TEntity, TStore>,
    entityStoreSlot: TOIMStoreSlot<TStore, TOIMEntitySlot<TEntity, TKey>, Partial<TEntity>>,
    records: readonly TOIMPersistRecord<TKey, TEntity>[],
): TOIMEntitySlot<TEntity, TKey>[] {
    if (records.length === 0) return [];
    return entityCollectionService.writeInBatch(entityStoreSlot, () => {
        const entitySlots: TOIMEntitySlot<TEntity, TKey>[] = new Array(records.length);
        for (let i = 0; i < records.length; i++) {
            entitySlots[i] = entityCollectionService.writeSlotContentByKey(entityStoreSlot, records[i].key, records[i].entity);
        }
        return entitySlots;
    });
}

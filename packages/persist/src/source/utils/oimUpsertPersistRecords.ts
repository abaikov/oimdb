import type { TOIMEntitySlot, TOIMStoreKey, TOIMStoreSlot } from '@oimdb/core';
import type { TOIMPersistEntityCollectionService } from '../types/TOIMPersistEntityCollectionService';
import type { TOIMPersistRecord } from '../types/TOIMPersistRecord';

export function oimUpsertPersistRecords<TKey extends TOIMStoreKey, TEntity extends object, TStore>(
    entityCollectionService: TOIMPersistEntityCollectionService<TKey, TEntity, TStore>,
    entityStoreSlot: TOIMStoreSlot<TStore, TOIMEntitySlot<TEntity, TKey>, Partial<TEntity>>,
    records: readonly TOIMPersistRecord<TKey, TEntity>[],
): TOIMEntitySlot<TEntity, TKey>[] {
    if (records.length === 0) return [];
    return entityCollectionService.slotContentService.upsertEntities(entityStoreSlot, records.map(record => record.entity));
}

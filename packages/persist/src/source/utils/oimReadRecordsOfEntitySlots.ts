import type { TOIMEntitySlot } from '@oimdb/core';
import type { TOIMPersistRecord } from '../types/TOIMPersistRecord';
import type { TOIMPersistRecords } from '../types/TOIMPersistRecords';

export function oimReadRecordsOfEntitySlots<TKey, TEntity extends object>(
    entitySlots: Iterable<TOIMEntitySlot<TEntity, TKey>>,
): TOIMPersistRecords<TKey, TEntity> {
    const records: TOIMPersistRecord<TKey, TEntity>[] = [];
    for (const entitySlot of entitySlots) {
        const entity = entitySlot.entity;
        if (entity !== undefined) records.push({ key: entitySlot.key, entity });
    }
    return { records };
}

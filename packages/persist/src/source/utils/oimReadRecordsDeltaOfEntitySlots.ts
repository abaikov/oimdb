import type { TOIMEntitySlot } from '@oimdb/core';
import { oimIsSlotReleased } from '@oimdb/core';
import type { TOIMPersistRecord } from '../types/TOIMPersistRecord';
import type { TOIMPersistRecordsDelta } from '../types/TOIMPersistRecordsDelta';

export function oimReadRecordsDeltaOfEntitySlots<TKey, TEntity extends object>(
    entitySlots: ReadonlySet<TOIMEntitySlot<TEntity, TKey>>,
    isSourceEntitySlot: (entitySlot: TOIMEntitySlot<TEntity, TKey>) => boolean,
): TOIMPersistRecordsDelta<TKey, TEntity> {
    const upserts: TOIMPersistRecord<TKey, TEntity>[] = [];
    const deletedKeyCandidates: TKey[] = [];
    for (const entitySlot of entitySlots) {
        const entity = entitySlot.entity;
        if (entity !== undefined && !oimIsSlotReleased(entitySlot) && isSourceEntitySlot(entitySlot)) {
            upserts.push({ key: entitySlot.key, entity });
        } else {
            deletedKeyCandidates.push(entitySlot.key);
        }
    }
    if (deletedKeyCandidates.length === 0) return { upserts, deletedKeys: deletedKeyCandidates };
    const keptKeys = new Set<TKey>();
    for (let i = 0; i < upserts.length; i++) keptKeys.add(upserts[i].key);
    const deletedKeys: TKey[] = [];
    for (let i = 0; i < deletedKeyCandidates.length; i++) {
        const key = deletedKeyCandidates[i];
        if (keptKeys.has(key)) continue;
        keptKeys.add(key);
        deletedKeys.push(key);
    }
    return { upserts, deletedKeys };
}

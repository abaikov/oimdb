import type { TOIMDisposer, TOIMEntitySlot } from '@oimdb/core';
import type { TOIMPersistRecords } from '../types/TOIMPersistRecords';
import type { TOIMPersistRecordsDelta } from '../types/TOIMPersistRecordsDelta';
import type { IOIMPersistSnapshotSource } from './IOIMPersistSnapshotSource';
import type { IOIMPersistSourceChangeMark } from './IOIMPersistSourceChangeMark';

export interface IOIMPersistRecordSource<TKey, TEntity extends object>
    extends IOIMPersistSnapshotSource<TOIMPersistRecords<TKey, TEntity>> {
    subscribeEntitySlotChanged(
        onEntitySlotChanged: (entitySlot: TOIMEntitySlot<TEntity, TKey>) => void,
    ): TOIMDisposer;
    readRecordsDelta(entitySlots: ReadonlySet<TOIMEntitySlot<TEntity, TKey>>): TOIMPersistRecordsDelta<TKey, TEntity>;
    findEntitySlotsByKeys(keys: readonly TKey[]): ReadonlySet<TOIMEntitySlot<TEntity, TKey>>;
    markEntitySlotChanges(entitySlots: Iterable<TOIMEntitySlot<TEntity, TKey>>): IOIMPersistSourceChangeMark;
    loadRecords(persistRecords: TOIMPersistRecords<TKey, TEntity>): void;
    unloadKeys(keys: readonly TKey[]): void;
}

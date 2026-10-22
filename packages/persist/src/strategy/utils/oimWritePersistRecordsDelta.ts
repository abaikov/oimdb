import type { TOIMPersistRecordsDelta } from '../../source/types/TOIMPersistRecordsDelta';

export function oimWritePersistRecordsDelta<TKey, TEntity>(
    persistRecordsDelta: TOIMPersistRecordsDelta<TKey, TEntity>,
    putRecord: (key: TKey, entity: TEntity) => void,
    deleteRecord: (key: TKey) => void,
): void {
    const upserts = persistRecordsDelta.upserts;
    for (let i = 0; i < upserts.length; i++) putRecord(upserts[i].key, upserts[i].entity);
    const deletedKeys = persistRecordsDelta.deletedKeys;
    for (let i = 0; i < deletedKeys.length; i++) deleteRecord(deletedKeys[i]);
}

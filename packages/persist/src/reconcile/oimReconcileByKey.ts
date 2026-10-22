import type { TOIMPersistRecord } from '../source/types/TOIMPersistRecord';
import type { TOIMPersistRecords } from '../source/types/TOIMPersistRecords';
import type { TOIMPersistHydrateReconcile } from './types/TOIMPersistHydrateReconcile';

export function oimReconcileByKey<TKey, TEntity>(
    resolveEntity: (currentEntity: TEntity | undefined, incomingEntity: TEntity, key: TKey) => TEntity | undefined,
): TOIMPersistHydrateReconcile<TOIMPersistRecords<TKey, TEntity>> {
    return (currentPersistRecords, incomingPersistRecords) => {
        const currentEntityByKey = new Map<TKey, TEntity>();
        const incomingEntityByKey = new Map<TKey, TEntity>();
        const orderedKeys: TKey[] = [];
        for (const record of currentPersistRecords.records) {
            if (!currentEntityByKey.has(record.key)) orderedKeys.push(record.key);
            currentEntityByKey.set(record.key, record.entity);
        }
        for (const record of incomingPersistRecords.records) {
            if (!currentEntityByKey.has(record.key) && !incomingEntityByKey.has(record.key)) orderedKeys.push(record.key);
            incomingEntityByKey.set(record.key, record.entity);
        }
        const records: TOIMPersistRecord<TKey, TEntity>[] = [];
        for (let i = 0; i < orderedKeys.length; i++) {
            const key = orderedKeys[i];
            const incomingEntity = incomingEntityByKey.get(key);
            const entity = incomingEntity === undefined
                ? currentEntityByKey.get(key)
                : resolveEntity(currentEntityByKey.get(key), incomingEntity, key);
            if (entity !== undefined) records.push({ key, entity });
        }
        return { records };
    };
}

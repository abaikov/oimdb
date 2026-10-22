import { oimWritePersistRecordsDelta } from '@oimdb/persist';
import type { IOIMPersistBackend, TOIMPersistRecords, TOIMPersistRecordsDelta } from '@oimdb/persist';
import { OIMPersistMemoryWriteBatch } from './OIMPersistMemoryWriteBatch';

export class OIMPersistMemoryBackend implements IOIMPersistBackend<OIMPersistMemoryWriteBatch> {
    protected readonly snapshotValueByStorageKey = new Map<string, unknown>();
    protected readonly entityByKeyByStorageKey = new Map<string, Map<unknown, unknown>>();

    public readSnapshotValue(storageKey: string): unknown {
        return this.snapshotValueByStorageKey.get(storageKey);
    }

    public readRecords(storageKey: string): TOIMPersistRecords<unknown, unknown> | undefined {
        const entityByKey = this.entityByKeyByStorageKey.get(storageKey);
        if (entityByKey === undefined) return undefined;
        return { records: Array.from(entityByKey, ([key, entity]) => ({ key, entity })) };
    }

    public readRecordsOfKeys(storageKey: string, keys: readonly unknown[]): TOIMPersistRecords<unknown, unknown> {
        const entityByKey = this.entityByKeyByStorageKey.get(storageKey);
        const records: { key: unknown; entity: unknown }[] = [];
        if (entityByKey === undefined) return { records };
        for (let i = 0; i < keys.length; i++) {
            if (entityByKey.has(keys[i])) records.push({ key: keys[i], entity: entityByKey.get(keys[i]) });
        }
        return { records };
    }

    public writeSnapshotValue(storageKey: string, snapshotValue: unknown): void {
        this.snapshotValueByStorageKey.set(storageKey, snapshotValue);
    }

    public deleteSnapshotValue(storageKey: string): void {
        this.snapshotValueByStorageKey.delete(storageKey);
    }

    public writeRecords(storageKey: string, persistRecords: TOIMPersistRecords<unknown, unknown>): void {
        const entityByKey = new Map<unknown, unknown>();
        const records = persistRecords.records;
        for (let i = 0; i < records.length; i++) entityByKey.set(records[i].key, records[i].entity);
        this.entityByKeyByStorageKey.set(storageKey, entityByKey);
    }

    public writeRecordsDelta(storageKey: string, persistRecordsDelta: TOIMPersistRecordsDelta<unknown, unknown>): void {
        let entityByKey = this.entityByKeyByStorageKey.get(storageKey);
        if (entityByKey === undefined) {
            entityByKey = new Map<unknown, unknown>();
            this.entityByKeyByStorageKey.set(storageKey, entityByKey);
        }
        const filedEntityByKey = entityByKey;
        oimWritePersistRecordsDelta(
            persistRecordsDelta,
            (key, entity) => { filedEntityByKey.set(key, entity); },
            key => { filedEntityByKey.delete(key); },
        );
    }

    public deleteRecords(storageKey: string): void {
        this.entityByKeyByStorageKey.delete(storageKey);
    }

    public createWriteBatch(): OIMPersistMemoryWriteBatch {
        return new OIMPersistMemoryWriteBatch({ persistMemoryBackend: this });
    }
}

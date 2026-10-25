import type { IOIMPersistRecordsService, TOIMPersistRecords, TOIMPersistRecordsDelta } from '@oimdb/persist';
import type { OIMPersistMemoryBackend } from './OIMPersistMemoryBackend';
import type { OIMPersistMemoryWriteBatch } from './OIMPersistMemoryWriteBatch';
import type { TOIMPersistMemoryServiceOptions } from './types/TOIMPersistMemoryServiceOptions';

export class OIMPersistMemoryRecordsService<TKey, TEntity>
implements IOIMPersistRecordsService<OIMPersistMemoryBackend, OIMPersistMemoryWriteBatch, TKey, TEntity> {
    private readonly storageKey: string;

    public constructor(persistMemoryServiceOptions: TOIMPersistMemoryServiceOptions) {
        this.storageKey = persistMemoryServiceOptions.storageKey;
    }

    public readRecords(
        persistMemoryBackend: OIMPersistMemoryBackend,
    ): Promise<TOIMPersistRecords<TKey, TEntity> | undefined> {
        return Promise.resolve(persistMemoryBackend.readRecords(this.storageKey) as TOIMPersistRecords<TKey, TEntity> | undefined);
    }

    public readRecordsOfKeys(
        persistMemoryBackend: OIMPersistMemoryBackend, keys: readonly TKey[],
    ): Promise<TOIMPersistRecords<TKey, TEntity>> {
        return Promise.resolve(persistMemoryBackend.readRecordsOfKeys(this.storageKey, keys) as TOIMPersistRecords<TKey, TEntity>);
    }

    public writeRecords(persistMemoryWriteBatch: OIMPersistMemoryWriteBatch, persistRecords: TOIMPersistRecords<TKey, TEntity>): void {
        persistMemoryWriteBatch.writeRecords(this.storageKey, persistRecords);
    }

    public writeRecordsDelta(
        persistMemoryWriteBatch: OIMPersistMemoryWriteBatch, persistRecordsDelta: TOIMPersistRecordsDelta<TKey, TEntity>,
    ): void {
        persistMemoryWriteBatch.writeRecordsDelta(this.storageKey, persistRecordsDelta);
    }

    public deleteRecords(persistMemoryWriteBatch: OIMPersistMemoryWriteBatch): void {
        persistMemoryWriteBatch.deleteRecords(this.storageKey);
    }
}

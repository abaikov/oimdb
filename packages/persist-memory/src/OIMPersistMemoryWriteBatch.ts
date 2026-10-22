import { OIMPersistWriteBatchChanges } from '@oimdb/persist';
import type { IOIMPersistWriteBatch, TOIMPersistRecords, TOIMPersistRecordsDelta } from '@oimdb/persist';
import type { OIMPersistMemoryBackend } from './OIMPersistMemoryBackend';
import type { TOIMPersistMemoryWriteBatchOptions } from './types/TOIMPersistMemoryWriteBatchOptions';

export class OIMPersistMemoryWriteBatch implements IOIMPersistWriteBatch {
    private readonly persistMemoryBackend: OIMPersistMemoryBackend;
    private readonly persistWriteBatchChanges = new OIMPersistWriteBatchChanges<OIMPersistMemoryBackend>();

    public constructor(persistMemoryWriteBatchOptions: TOIMPersistMemoryWriteBatchOptions) {
        this.persistMemoryBackend = persistMemoryWriteBatchOptions.persistMemoryBackend;
    }

    public writeSnapshotValue(storageKey: string, snapshotValue: unknown): void {
        this.persistWriteBatchChanges.addWriteBatchChange(persistMemoryBackend => {
            persistMemoryBackend.writeSnapshotValue(storageKey, snapshotValue);
        });
    }

    public deleteSnapshotValue(storageKey: string): void {
        this.persistWriteBatchChanges.addWriteBatchChange(persistMemoryBackend => {
            persistMemoryBackend.deleteSnapshotValue(storageKey);
        });
    }

    public writeRecords(storageKey: string, persistRecords: TOIMPersistRecords<unknown, unknown>): void {
        this.persistWriteBatchChanges.addWriteBatchChange(persistMemoryBackend => {
            persistMemoryBackend.writeRecords(storageKey, persistRecords);
        });
    }

    public writeRecordsDelta(storageKey: string, persistRecordsDelta: TOIMPersistRecordsDelta<unknown, unknown>): void {
        this.persistWriteBatchChanges.addWriteBatchChange(persistMemoryBackend => {
            persistMemoryBackend.writeRecordsDelta(storageKey, persistRecordsDelta);
        });
    }

    public deleteRecords(storageKey: string): void {
        this.persistWriteBatchChanges.addWriteBatchChange(persistMemoryBackend => {
            persistMemoryBackend.deleteRecords(storageKey);
        });
    }

    public commit(): Promise<void> {
        this.persistWriteBatchChanges.applyWriteBatchChanges(this.persistMemoryBackend);
        return Promise.resolve();
    }
}

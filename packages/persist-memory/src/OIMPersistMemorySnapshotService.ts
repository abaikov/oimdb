import type { IOIMPersistSnapshotService } from '@oimdb/persist';
import type { OIMPersistMemoryBackend } from './OIMPersistMemoryBackend';
import type { OIMPersistMemoryWriteBatch } from './OIMPersistMemoryWriteBatch';
import type { TOIMPersistMemoryServiceOptions } from './types/TOIMPersistMemoryServiceOptions';

export class OIMPersistMemorySnapshotService<TSnapshot>
implements IOIMPersistSnapshotService<OIMPersistMemoryBackend, OIMPersistMemoryWriteBatch, TSnapshot> {
    private readonly storageKey: string;

    public constructor(persistMemoryServiceOptions: TOIMPersistMemoryServiceOptions) {
        this.storageKey = persistMemoryServiceOptions.storageKey;
    }

    public readSnapshot(persistMemoryBackend: OIMPersistMemoryBackend): Promise<TSnapshot | undefined> {
        return Promise.resolve(persistMemoryBackend.readSnapshotValue(this.storageKey) as TSnapshot | undefined);
    }

    public writeSnapshot(persistMemoryWriteBatch: OIMPersistMemoryWriteBatch, snapshot: TSnapshot): void {
        persistMemoryWriteBatch.writeSnapshotValue(this.storageKey, snapshot);
    }

    public deleteSnapshot(persistMemoryWriteBatch: OIMPersistMemoryWriteBatch): void {
        persistMemoryWriteBatch.deleteSnapshotValue(this.storageKey);
    }
}

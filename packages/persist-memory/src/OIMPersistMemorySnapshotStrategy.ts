import type { IOIMPersistSnapshotStrategy } from '@oimdb/persist';
import type { OIMPersistMemoryBackend } from './OIMPersistMemoryBackend';
import type { OIMPersistMemoryWriteBatch } from './OIMPersistMemoryWriteBatch';
import type { TOIMPersistMemoryStrategyOptions } from './types/TOIMPersistMemoryStrategyOptions';

export class OIMPersistMemorySnapshotStrategy<TSnapshot>
implements IOIMPersistSnapshotStrategy<OIMPersistMemoryBackend, OIMPersistMemoryWriteBatch, TSnapshot> {
    private readonly storageKey: string;

    public constructor(persistMemoryStrategyOptions: TOIMPersistMemoryStrategyOptions) {
        this.storageKey = persistMemoryStrategyOptions.storageKey;
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

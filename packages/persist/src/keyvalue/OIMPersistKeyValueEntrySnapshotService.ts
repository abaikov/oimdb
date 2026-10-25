import type { IOIMPersistSnapshotService } from '../strategy/interfaces/IOIMPersistSnapshotService';
import type { OIMPersistKeyValueBackend } from './OIMPersistKeyValueBackend';
import type { OIMPersistKeyValueWriteBatch } from './OIMPersistKeyValueWriteBatch';
import type { TOIMPersistKeyValueEntrySnapshotServiceOptions } from './types/TOIMPersistKeyValueEntrySnapshotServiceOptions';

export class OIMPersistKeyValueEntrySnapshotService<TSnapshot>
implements IOIMPersistSnapshotService<OIMPersistKeyValueBackend, OIMPersistKeyValueWriteBatch, TSnapshot> {
    private readonly storageKey: string;

    public constructor(persistKeyValueEntrySnapshotServiceOptions: TOIMPersistKeyValueEntrySnapshotServiceOptions) {
        this.storageKey = persistKeyValueEntrySnapshotServiceOptions.storageKey;
    }

    public async readSnapshot(persistKeyValueBackend: OIMPersistKeyValueBackend): Promise<TSnapshot | undefined> {
        return await persistKeyValueBackend.readValue(this.storageKey) as TSnapshot | undefined;
    }

    public writeSnapshot(persistKeyValueWriteBatch: OIMPersistKeyValueWriteBatch, snapshot: TSnapshot): void {
        persistKeyValueWriteBatch.writeValue(this.storageKey, snapshot);
    }

    public deleteSnapshot(persistKeyValueWriteBatch: OIMPersistKeyValueWriteBatch): void {
        persistKeyValueWriteBatch.removeValue(this.storageKey);
    }
}

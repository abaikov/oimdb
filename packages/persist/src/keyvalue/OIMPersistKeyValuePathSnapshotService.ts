import type { IOIMPersistSnapshotService } from '../strategy/interfaces/IOIMPersistSnapshotService';
import type { OIMPersistKeyValueBackend } from './OIMPersistKeyValueBackend';
import type { OIMPersistKeyValueWriteBatch } from './OIMPersistKeyValueWriteBatch';
import type { TOIMPersistKeyValuePathSnapshotServiceOptions } from './types/TOIMPersistKeyValuePathSnapshotServiceOptions';
import { getOIMPath } from './utils/getOIMPath';

export class OIMPersistKeyValuePathSnapshotService<TSnapshot>
implements IOIMPersistSnapshotService<OIMPersistKeyValueBackend, OIMPersistKeyValueWriteBatch, TSnapshot> {
    private readonly storageKey: string;
    private readonly path: readonly string[];

    public constructor(persistKeyValuePathSnapshotServiceOptions: TOIMPersistKeyValuePathSnapshotServiceOptions) {
        if (persistKeyValuePathSnapshotServiceOptions.path.length === 0) {
            throw new Error(
                'OIMPersistKeyValuePathSnapshotService: the path is empty, so the snapshot would replace the whole stored '
                + 'value. Use OIMPersistKeyValueEntrySnapshotService to store a snapshot under the key itself.',
            );
        }
        this.storageKey = persistKeyValuePathSnapshotServiceOptions.storageKey;
        this.path = persistKeyValuePathSnapshotServiceOptions.path;
    }

    public async readSnapshot(persistKeyValueBackend: OIMPersistKeyValueBackend): Promise<TSnapshot | undefined> {
        return getOIMPath(await persistKeyValueBackend.readValue(this.storageKey), this.path) as TSnapshot | undefined;
    }

    public writeSnapshot(persistKeyValueWriteBatch: OIMPersistKeyValueWriteBatch, snapshot: TSnapshot): void {
        persistKeyValueWriteBatch.writeValueAtPath(this.storageKey, this.path, snapshot);
    }

    public deleteSnapshot(persistKeyValueWriteBatch: OIMPersistKeyValueWriteBatch): void {
        persistKeyValueWriteBatch.deleteValueAtPath(this.storageKey, this.path);
    }
}

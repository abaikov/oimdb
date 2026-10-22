import type { IOIMPersistSnapshotStrategy } from '../strategy/interfaces/IOIMPersistSnapshotStrategy';
import type { OIMPersistKeyValueBackend } from './OIMPersistKeyValueBackend';
import type { OIMPersistKeyValueWriteBatch } from './OIMPersistKeyValueWriteBatch';
import type { TOIMPersistKeyValuePathStrategyOptions } from './types/TOIMPersistKeyValuePathStrategyOptions';
import { oimGetPath } from './utils/oimGetPath';

export class OIMPersistKeyValuePathStrategy<TSnapshot>
implements IOIMPersistSnapshotStrategy<OIMPersistKeyValueBackend, OIMPersistKeyValueWriteBatch, TSnapshot> {
    private readonly storageKey: string;
    private readonly path: readonly string[];

    public constructor(persistKeyValuePathStrategyOptions: TOIMPersistKeyValuePathStrategyOptions) {
        if (persistKeyValuePathStrategyOptions.path.length === 0) {
            throw new Error(
                'OIMPersistKeyValuePathStrategy: the path is empty, so the snapshot would replace the whole stored '
                + 'value. Use OIMPersistKeyValueEntryStrategy to store a snapshot under the key itself.',
            );
        }
        this.storageKey = persistKeyValuePathStrategyOptions.storageKey;
        this.path = persistKeyValuePathStrategyOptions.path;
    }

    public async readSnapshot(persistKeyValueBackend: OIMPersistKeyValueBackend): Promise<TSnapshot | undefined> {
        return oimGetPath(await persistKeyValueBackend.readValue(this.storageKey), this.path) as TSnapshot | undefined;
    }

    public writeSnapshot(persistKeyValueWriteBatch: OIMPersistKeyValueWriteBatch, snapshot: TSnapshot): void {
        persistKeyValueWriteBatch.writeValueAtPath(this.storageKey, this.path, snapshot);
    }

    public deleteSnapshot(persistKeyValueWriteBatch: OIMPersistKeyValueWriteBatch): void {
        persistKeyValueWriteBatch.deleteValueAtPath(this.storageKey, this.path);
    }
}

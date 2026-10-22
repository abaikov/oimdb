import type { IOIMPersistSnapshotStrategy } from '../strategy/interfaces/IOIMPersistSnapshotStrategy';
import type { OIMPersistKeyValueBackend } from './OIMPersistKeyValueBackend';
import type { OIMPersistKeyValueWriteBatch } from './OIMPersistKeyValueWriteBatch';
import type { TOIMPersistKeyValueEntryStrategyOptions } from './types/TOIMPersistKeyValueEntryStrategyOptions';

export class OIMPersistKeyValueEntryStrategy<TSnapshot>
implements IOIMPersistSnapshotStrategy<OIMPersistKeyValueBackend, OIMPersistKeyValueWriteBatch, TSnapshot> {
    private readonly storageKey: string;

    public constructor(persistKeyValueEntryStrategyOptions: TOIMPersistKeyValueEntryStrategyOptions) {
        this.storageKey = persistKeyValueEntryStrategyOptions.storageKey;
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

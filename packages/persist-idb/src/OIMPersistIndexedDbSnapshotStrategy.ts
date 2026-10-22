import type { IOIMPersistSnapshotStrategy } from '@oimdb/persist';
import type { OIMPersistIndexedDbBackend } from './OIMPersistIndexedDbBackend';
import type { OIMPersistIndexedDbWriteBatch } from './OIMPersistIndexedDbWriteBatch';
import type { TOIMPersistIndexedDbPrimaryKey } from './types/TOIMPersistIndexedDbPrimaryKey';
import type { TOIMPersistIndexedDbSnapshotStrategyOptions } from './types/TOIMPersistIndexedDbSnapshotStrategyOptions';

export class OIMPersistIndexedDbSnapshotStrategy<TSnapshot>
implements IOIMPersistSnapshotStrategy<OIMPersistIndexedDbBackend, OIMPersistIndexedDbWriteBatch, TSnapshot> {
    private readonly tableName: string;
    private readonly primaryKey: TOIMPersistIndexedDbPrimaryKey;

    public constructor(persistIndexedDbSnapshotStrategyOptions: TOIMPersistIndexedDbSnapshotStrategyOptions) {
        this.tableName = persistIndexedDbSnapshotStrategyOptions.tableName;
        this.primaryKey = persistIndexedDbSnapshotStrategyOptions.primaryKey;
    }

    public async readSnapshot(persistIndexedDbBackend: OIMPersistIndexedDbBackend): Promise<TSnapshot | undefined> {
        return await persistIndexedDbBackend.readTableValue(this.tableName, this.primaryKey) as TSnapshot | undefined;
    }

    public writeSnapshot(persistIndexedDbWriteBatch: OIMPersistIndexedDbWriteBatch, snapshot: TSnapshot): void {
        persistIndexedDbWriteBatch.putTableValue(this.tableName, this.primaryKey, snapshot);
    }

    public deleteSnapshot(persistIndexedDbWriteBatch: OIMPersistIndexedDbWriteBatch): void {
        persistIndexedDbWriteBatch.deleteTableValue(this.tableName, this.primaryKey);
    }
}

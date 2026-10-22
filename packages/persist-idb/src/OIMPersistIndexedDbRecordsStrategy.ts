import { oimWritePersistRecordsDelta } from '@oimdb/persist';
import type {
    IOIMPersistRecordsStrategy, TOIMPersistRecord, TOIMPersistRecords, TOIMPersistRecordsDelta,
} from '@oimdb/persist';
import type { OIMPersistIndexedDbBackend } from './OIMPersistIndexedDbBackend';
import type { OIMPersistIndexedDbWriteBatch } from './OIMPersistIndexedDbWriteBatch';
import type { TOIMPersistIndexedDbPrimaryKey } from './types/TOIMPersistIndexedDbPrimaryKey';
import type { TOIMPersistIndexedDbRecordsStrategyOptions } from './types/TOIMPersistIndexedDbRecordsStrategyOptions';

export class OIMPersistIndexedDbRecordsStrategy<TKey extends TOIMPersistIndexedDbPrimaryKey, TEntity>
implements IOIMPersistRecordsStrategy<OIMPersistIndexedDbBackend, OIMPersistIndexedDbWriteBatch, TKey, TEntity> {
    private readonly tableName: string;

    public constructor(persistIndexedDbRecordsStrategyOptions: TOIMPersistIndexedDbRecordsStrategyOptions) {
        this.tableName = persistIndexedDbRecordsStrategyOptions.tableName;
    }

    public async readRecords(
        persistIndexedDbBackend: OIMPersistIndexedDbBackend,
    ): Promise<TOIMPersistRecords<TKey, TEntity> | undefined> {
        const persistIndexedDbTableRecords = await persistIndexedDbBackend.readAllTableRecords(this.tableName);
        if (persistIndexedDbTableRecords === undefined) return undefined;
        return {
            records: persistIndexedDbTableRecords.map(persistIndexedDbTableRecord => ({
                key: persistIndexedDbTableRecord.key as TKey,
                entity: persistIndexedDbTableRecord.value as TEntity,
            })),
        };
    }

    public async readRecordsOfKeys(
        persistIndexedDbBackend: OIMPersistIndexedDbBackend, keys: readonly TKey[],
    ): Promise<TOIMPersistRecords<TKey, TEntity>> {
        const values = await persistIndexedDbBackend.readTableValues(this.tableName, keys);
        const records: TOIMPersistRecord<TKey, TEntity>[] = [];
        for (let i = 0; i < keys.length; i++) {
            if (values[i] !== undefined) records.push({ key: keys[i], entity: values[i] as TEntity });
        }
        return { records };
    }

    public writeRecords(persistIndexedDbWriteBatch: OIMPersistIndexedDbWriteBatch, persistRecords: TOIMPersistRecords<TKey, TEntity>): void {
        const tableName = this.tableName;
        persistIndexedDbWriteBatch.clearTable(tableName);
        const records = persistRecords.records;
        for (let i = 0; i < records.length; i++) persistIndexedDbWriteBatch.putTableValue(tableName, records[i].key, records[i].entity);
    }

    public writeRecordsDelta(
        persistIndexedDbWriteBatch: OIMPersistIndexedDbWriteBatch, persistRecordsDelta: TOIMPersistRecordsDelta<TKey, TEntity>,
    ): void {
        const tableName = this.tableName;
        oimWritePersistRecordsDelta(
            persistRecordsDelta,
            (key, entity) => { persistIndexedDbWriteBatch.putTableValue(tableName, key, entity); },
            key => { persistIndexedDbWriteBatch.deleteTableValue(tableName, key); },
        );
    }

    public deleteRecords(persistIndexedDbWriteBatch: OIMPersistIndexedDbWriteBatch): void {
        persistIndexedDbWriteBatch.clearTable(this.tableName);
    }
}

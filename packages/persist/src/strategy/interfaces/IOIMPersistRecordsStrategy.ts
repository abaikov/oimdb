import type { TOIMPersistRecords } from '../../source/types/TOIMPersistRecords';
import type { TOIMPersistRecordsDelta } from '../../source/types/TOIMPersistRecordsDelta';

export interface IOIMPersistRecordsStrategy<TPersistBackend, TWriteBatch, TKey, TEntity> {
    readRecords(persistBackend: TPersistBackend): Promise<TOIMPersistRecords<TKey, TEntity> | undefined>;
    readRecordsOfKeys(persistBackend: TPersistBackend, keys: readonly TKey[]): Promise<TOIMPersistRecords<TKey, TEntity>>;
    writeRecords(writeBatch: TWriteBatch, persistRecords: TOIMPersistRecords<TKey, TEntity>): void;
    writeRecordsDelta(writeBatch: TWriteBatch, persistRecordsDelta: TOIMPersistRecordsDelta<TKey, TEntity>): void;
    deleteRecords(writeBatch: TWriteBatch): void;
}

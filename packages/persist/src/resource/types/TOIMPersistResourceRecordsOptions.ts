import type { TOIMPersistHydrateReconcile } from '../../reconcile/types/TOIMPersistHydrateReconcile';
import type { IOIMPersistRecordSource } from '../../source/interfaces/IOIMPersistRecordSource';
import type { TOIMPersistRecords } from '../../source/types/TOIMPersistRecords';
import type { IOIMPersistRecordsService } from '../../strategy/interfaces/IOIMPersistRecordsService';

export type TOIMPersistResourceRecordsOptions<TPersistBackend, TWriteBatch, TKey extends NonNullable<unknown>, TEntity extends object> = {
    readonly persistRecordSource: IOIMPersistRecordSource<TKey, TEntity>;
    readonly persistRecordsService: IOIMPersistRecordsService<TPersistBackend, TWriteBatch, TKey, TEntity>;
    readonly persistHydrateReconcile?: TOIMPersistHydrateReconcile<TOIMPersistRecords<TKey, TEntity>> | undefined;
};

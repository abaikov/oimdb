import type { TOIMPersistHydrateReconcile } from '../../reconcile/types/TOIMPersistHydrateReconcile';
import type { IOIMPersistRecordSource } from '../../source/interfaces/IOIMPersistRecordSource';
import type { TOIMPersistRecords } from '../../source/types/TOIMPersistRecords';
import type { IOIMPersistRecordsStrategy } from '../../strategy/interfaces/IOIMPersistRecordsStrategy';

export type TOIMPersistResourceRecordsOptions<TPersistBackend, TWriteBatch, TKey, TEntity extends object> = {
    readonly persistRecordSource: IOIMPersistRecordSource<TKey, TEntity>;
    readonly persistRecordsStrategy: IOIMPersistRecordsStrategy<TPersistBackend, TWriteBatch, TKey, TEntity>;
    readonly persistHydrateReconcile?: TOIMPersistHydrateReconcile<TOIMPersistRecords<TKey, TEntity>> | undefined;
};

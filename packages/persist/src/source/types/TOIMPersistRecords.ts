import type { TOIMPersistRecord } from './TOIMPersistRecord';

export type TOIMPersistRecords<TKey, TEntity> = {
    readonly records: readonly TOIMPersistRecord<TKey, TEntity>[];
};

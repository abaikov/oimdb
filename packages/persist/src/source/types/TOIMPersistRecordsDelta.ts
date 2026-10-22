import type { TOIMPersistRecord } from './TOIMPersistRecord';

export type TOIMPersistRecordsDelta<TKey, TEntity> = {
    readonly upserts: readonly TOIMPersistRecord<TKey, TEntity>[];
    readonly deletedKeys: readonly TKey[];
};

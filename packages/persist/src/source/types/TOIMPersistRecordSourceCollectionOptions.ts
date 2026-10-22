import type { TOIMDefaultSlotStore, TOIMEntitySlot, TOIMStoreKey, TOIMStoreSlot } from '@oimdb/core';
import type { OIMPersistEntityWriter } from '../OIMPersistEntityWriter';
import type { TOIMPersistEntityCollectionService } from './TOIMPersistEntityCollectionService';

export type TOIMPersistRecordSourceCollectionOptions<
    TKey extends TOIMStoreKey, TEntity extends object, TStore = TOIMDefaultSlotStore<TKey, TOIMEntitySlot<TEntity, TKey>>,
> = {
    readonly entityCollectionService: TOIMPersistEntityCollectionService<TKey, TEntity, TStore>;
    readonly entityStoreSlot: TOIMStoreSlot<TStore, TOIMEntitySlot<TEntity, TKey>, Partial<TEntity>>;
    readonly persistEntityWriter: OIMPersistEntityWriter<TEntity, TKey>;
};

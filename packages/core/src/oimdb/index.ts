import { createOIMSlotCollectionIndexStoreAggregate } from '@oimdb/core';
import type { TOIMEntityColumnName, TOIMEntitySlot, TOIMIndexKey, TOIMStoreKey } from '@oimdb/core';
import type { OIMEntityCollection } from './OIMEntityCollection';
import { OIMEntityIndex } from './OIMEntityIndex';

export function index<
    TEntity extends object, TColumnName extends TOIMEntityColumnName<TEntity>,
    const TColumns extends readonly TOIMEntityColumnName<TEntity>[] = readonly TOIMEntityColumnName<TEntity>[],
    TKey extends TOIMStoreKey = [TOIMIndexKey<TEntity, TColumns>] extends [TOIMStoreKey]
        ? Extract<TOIMIndexKey<TEntity, TColumns>, TOIMStoreKey> : never,
>(
    entityCollection: OIMEntityCollection<TEntity, TColumnName>,
    options: Parameters<typeof createOIMSlotCollectionIndexStoreAggregate<TEntity, TOIMStoreKey, Map<TOIMStoreKey, TOIMEntitySlot<TEntity, TOIMStoreKey>>, TColumns, TKey>>[1],
): OIMEntityIndex<TEntity, TKey, ReturnType<typeof createOIMSlotCollectionIndexStoreAggregate<TEntity, TOIMStoreKey, Map<TOIMStoreKey, TOIMEntitySlot<TEntity, TOIMStoreKey>>, TColumns, TKey>>> {
    return new OIMEntityIndex(createOIMSlotCollectionIndexStoreAggregate<TEntity, TOIMStoreKey, Map<TOIMStoreKey, TOIMEntitySlot<TEntity, TOIMStoreKey>>, TColumns, TKey>(
        entityCollection.slotCollectionStoreAggregate, options,
    ));
}

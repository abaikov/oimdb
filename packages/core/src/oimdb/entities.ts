import type { OIMDB, TOIMEntityColumnName } from '@oimdb/core';
import { createOIMEntitySlotCollectionStoreAggregate } from '@oimdb/core';
import { OIMEntityCollection } from '../oim/OIMEntityCollection';

export function entities<TEntity extends object, TColumnName extends TOIMEntityColumnName<TEntity> = TOIMEntityColumnName<TEntity>>(
    db: OIMDB,
    options: Parameters<typeof createOIMEntitySlotCollectionStoreAggregate<TEntity, TColumnName>>[1] = {},
): OIMEntityCollection<TEntity, TColumnName> {
    return new OIMEntityCollection(createOIMEntitySlotCollectionStoreAggregate<TEntity, TColumnName>(db, options));
}

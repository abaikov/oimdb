import type { OIMDB } from '@oimdb/core';
import { createOIMEntityContentService, createOIMSingleSlotStoreAggregate } from '@oimdb/core';
import { OIMSingleEntity } from '../oim/OIMSingleEntity';

export function entity<TEntity extends object>(db: OIMDB): OIMSingleEntity<TEntity> {
    return new OIMSingleEntity(createOIMSingleSlotStoreAggregate(db, { slotContentService: createOIMEntityContentService<TEntity>() }));
}

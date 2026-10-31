import type { IOIMSlotReleasePolicy, TOIMStoreKey } from '@oimdb/core';
import { OIMDB, createOIMInPlaceEntityWriter } from '@oimdb/core';
import { OIMPersistEntityWriter } from '../../src';
import { createOIMEntityContentService } from '@oimdb/core';
import { createOIMSlotCollectionService } from '@oimdb/core';

export function createTestEntityCollection<TEntity extends { readonly id: string }>(
    testEntityCollectionOptions: {
        readonly slotReleasePolicy?: IOIMSlotReleasePolicy | undefined;
        readonly db?: OIMDB | undefined;
    } = {},
) {
    const db = testEntityCollectionOptions.db ?? new OIMDB();
    const persistEntityWriter = new OIMPersistEntityWriter<TEntity, TOIMStoreKey>({ entityWriter: createOIMInPlaceEntityWriter() });
    const entityCollectionService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TEntity>({ entityWriter: persistEntityWriter }), slotReleasePolicy: testEntityCollectionOptions.slotReleasePolicy });
    const entityStoreSlot = entityCollectionService.createStoreSlot(db);
    return { db, persistEntityWriter, entityCollectionService, entityStoreSlot };
}

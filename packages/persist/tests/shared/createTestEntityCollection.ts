import type { IOIMSlotReleasePolicy, TOIMStoreKey } from '@oimdb/core';
import { OIMDB, createOIMEntityService, createOIMEntityWriterInPlace } from '@oimdb/core';
import { OIMPersistEntityWriter } from '../../src';

export function createTestEntityCollection<TEntity extends { readonly id: string }>(
    testEntityCollectionOptions: {
        readonly slotReleasePolicy?: IOIMSlotReleasePolicy | undefined;
        readonly db?: OIMDB | undefined;
    } = {},
) {
    const db = testEntityCollectionOptions.db ?? new OIMDB();
    const persistEntityWriter = new OIMPersistEntityWriter<TEntity, TOIMStoreKey>({ entityWriter: createOIMEntityWriterInPlace() });
    const entityCollectionService = createOIMEntityService<TEntity>(db, {
        keyOf: entity => entity.id,
        entityWriter: persistEntityWriter,
        slotReleasePolicy: testEntityCollectionOptions.slotReleasePolicy,
    });
    const entityStoreSlot = entityCollectionService.createStoreSlot(db);
    return { db, persistEntityWriter, entityCollectionService, entityStoreSlot };
}

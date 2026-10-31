import { IDBFactory } from 'fake-indexeddb';
import type { TOIMEntitySlot, TOIMStoreKey } from '@oimdb/core';
import { OIMDB } from '@oimdb/core';
import {
    OIMPersistBucketRecordSource,
    OIMPersistRecordsResource,
    OIMPersistFrameScheduler,
    OIMPersistor,
} from '@oimdb/persist';
import type { OIMPersistIndexedDbWriteBatch } from '../src';
import { OIMPersistIndexedDbBackend, OIMPersistIndexedDbRecordsService } from '../src';
import { createOIMEntityContentService } from '@oimdb/core';
import { createOIMSlotCollectionService } from '@oimdb/core';
import { OIMPositionalArrayBucketContentService } from '@oimdb/core';
import { OIMBucketCommands } from '@oimdb/core';

type TCard = { id: string; title: string };

function buildSeededSearch() {
    const db = new OIMDB();
    const entityService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard>() });
    const entityStoreSlot = entityService.createStoreSlot(db);
    const bucketService = createOIMSlotCollectionService({ slotContentService: new OIMPositionalArrayBucketContentService<TOIMEntitySlot<TCard, TOIMStoreKey>>({ bucketCommands: new OIMBucketCommands({ maxCommandsPerSlot: undefined }) }) });
    const bucketStoreSlot = bucketService.createStoreSlot(db);
    const cardSlots = entityService.writeInBatch(entityStoreSlot, () => ([{ id: 'c1', title: 'alpha' }, { id: 'c2', title: 'beta' }]).map(entity => entityService.writeSlotContentByKey(entityStoreSlot, entity.id, entity)));
    db.flush();
    const bucketSlot = bucketService.holdSlotByKey(bucketStoreSlot, 'results');
    bucketService.slotContentService.writeSlotContent(bucketSlot, cardSlots);
    db.flush();
    const persistRecordsResource = new OIMPersistRecordsResource<
        OIMPersistIndexedDbBackend, OIMPersistIndexedDbWriteBatch, TOIMStoreKey, TCard
    >({
        persistRecordSource: new OIMPersistBucketRecordSource({
            channelMap: db,
            entityCollectionService: entityService,
            entityStoreSlot,
            bucketContentService: bucketService.slotContentService,
            bucketSlot,
        }),
        persistRecordsService: new OIMPersistIndexedDbRecordsService<TOIMStoreKey, TCard>({ tableName: 'cards' }),
    });
    const readMemberKeys = (): unknown[] =>
        Array.from(bucketService.slotContentService.getBucketMemberSlots(bucketSlot), entitySlot => entitySlot.key);
    return { db, entityService, entityStoreSlot, persistRecordsResource, readMemberKeys };
}

function createPersistor(
    persistIndexedDbBackend: OIMPersistIndexedDbBackend,
    db: OIMDB,
): OIMPersistor<OIMPersistIndexedDbBackend, OIMPersistIndexedDbWriteBatch> {
    return new OIMPersistor<OIMPersistIndexedDbBackend, OIMPersistIndexedDbWriteBatch>({
        persistBackend: persistIndexedDbBackend,
        persistScheduler: new OIMPersistFrameScheduler({ channelSlot: db.defaultChannelSlot }),
    });
}

describe('the records strategy on a table that was never written', () => {
    test('leaves a seeded bucket alone when the table does not exist', async () => {
        const seededSearch = buildSeededSearch();
        const persistor = createPersistor(
            new OIMPersistIndexedDbBackend({ databaseName: 'fresh-install-db', indexedDb: new IDBFactory() }),
            seededSearch.db,
        );
        persistor.addPersistResource(seededSearch.persistRecordsResource);

        await persistor.hydrate();
        seededSearch.db.flush();

        expect(seededSearch.readMemberKeys()).toEqual(['c1', 'c2']);
        persistor.destroy();
    });

    test('nor does the read create the table it was asked about', async () => {
        const indexedDb = new IDBFactory();
        const persistIndexedDbBackend = new OIMPersistIndexedDbBackend({ databaseName: 'read-creates-nothing-db', indexedDb });

        expect(await persistIndexedDbBackend.readAllTableRecords('cards')).toBeUndefined();
        expect(await persistIndexedDbBackend.readAllTableRecords('cards')).toBeUndefined();
        expect(await persistIndexedDbBackend.readTableValue('cards', 'c1')).toBeUndefined();
        expect(await indexedDb.databases()).toEqual([{ name: 'read-creates-nothing-db', version: 1 }]);
    });

    test('still empties a bucket whose table exists and holds nothing', async () => {
        const indexedDb = new IDBFactory();
        const databaseName = 'stored-empty-db';

        const sourceSearch = buildSeededSearch();
        const sourcePersistor = createPersistor(new OIMPersistIndexedDbBackend({ databaseName, indexedDb }), sourceSearch.db);
        sourcePersistor.addPersistResource(sourceSearch.persistRecordsResource);
        await sourcePersistor.persist();
        await sourcePersistor.clearPersisted();
        sourcePersistor.destroy();

        const targetSearch = buildSeededSearch();
        const targetPersistor = createPersistor(new OIMPersistIndexedDbBackend({ databaseName, indexedDb }), targetSearch.db);
        targetPersistor.addPersistResource(targetSearch.persistRecordsResource);
        await targetPersistor.hydrate();
        targetSearch.db.flush();

        expect(targetSearch.readMemberKeys()).toEqual([]);
        expect(targetSearch.entityService.findSlotByKey(targetSearch.entityStoreSlot, 'c1')?.entity?.title).toBe('alpha');
        targetPersistor.destroy();
    });
});

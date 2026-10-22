import { IDBFactory } from 'fake-indexeddb';
import type { TOIMEntitySlot, TOIMStoreKey } from '@oimdb/core';
import {
    OIMDB,
    createOIMBucketService,
    createOIMEntityService,
} from '@oimdb/core';
import {
    OIMPersistRecordSourceBucketDriven,
    OIMPersistResourceRecords,
    OIMPersistSchedulerFrameDriven,
    OIMPersistor,
} from '@oimdb/persist';
import type { OIMPersistIndexedDbWriteBatch } from '../src';
import { OIMPersistIndexedDbBackend, OIMPersistIndexedDbRecordsStrategy } from '../src';

type TCard = { id: string; title: string };

function buildSeededSearch() {
    const db = new OIMDB();
    const entityService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
    const entityStoreSlot = entityService.createStoreSlot(db);
    const bucketService = createOIMBucketService<TOIMEntitySlot<TCard, TOIMStoreKey>>(db);
    const bucketStoreSlot = bucketService.createStoreSlot(db);
    const cardSlots = entityService.slotContentService.upsertEntities(entityStoreSlot, [{ id: 'c1', title: 'alpha' }, { id: 'c2', title: 'beta' }]);
    db.flush();
    const bucketSlot = bucketService.holdSlotByKey(bucketStoreSlot, 'results');
    bucketService.slotContentService.writeBucketMemberSlots(bucketSlot, cardSlots);
    db.flush();
    const persistResourceRecords = new OIMPersistResourceRecords<
        OIMPersistIndexedDbBackend, OIMPersistIndexedDbWriteBatch, TOIMStoreKey, TCard
    >({
        persistRecordSource: new OIMPersistRecordSourceBucketDriven({
            channelMap: db,
            entityCollectionService: entityService,
            entityStoreSlot,
            slotContentBucketService: bucketService.slotContentService,
            bucketSlot,
        }),
        persistRecordsStrategy: new OIMPersistIndexedDbRecordsStrategy<TOIMStoreKey, TCard>({ tableName: 'cards' }),
    });
    const readMemberKeys = (): unknown[] =>
        Array.from(bucketService.slotContentService.getBucketMemberSlots(bucketSlot), entitySlot => entitySlot.key);
    return { db, entityService, entityStoreSlot, persistResourceRecords, readMemberKeys };
}

function createPersistor(
    persistIndexedDbBackend: OIMPersistIndexedDbBackend,
    db: OIMDB,
): OIMPersistor<OIMPersistIndexedDbBackend, OIMPersistIndexedDbWriteBatch> {
    return new OIMPersistor<OIMPersistIndexedDbBackend, OIMPersistIndexedDbWriteBatch>({
        persistBackend: persistIndexedDbBackend,
        persistScheduler: new OIMPersistSchedulerFrameDriven({ channelSlot: db.defaultChannelSlot }),
    });
}

describe('the records strategy on a table that was never written', () => {
    test('leaves a seeded bucket alone when the table does not exist', async () => {
        const seededSearch = buildSeededSearch();
        const persistor = createPersistor(
            new OIMPersistIndexedDbBackend({ databaseName: 'fresh-install-db', indexedDb: new IDBFactory() }),
            seededSearch.db,
        );
        persistor.addPersistResource(seededSearch.persistResourceRecords);

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
        sourcePersistor.addPersistResource(sourceSearch.persistResourceRecords);
        await sourcePersistor.persist();
        await sourcePersistor.clearPersisted();
        sourcePersistor.destroy();

        const targetSearch = buildSeededSearch();
        const targetPersistor = createPersistor(new OIMPersistIndexedDbBackend({ databaseName, indexedDb }), targetSearch.db);
        targetPersistor.addPersistResource(targetSearch.persistResourceRecords);
        await targetPersistor.hydrate();
        targetSearch.db.flush();

        expect(targetSearch.readMemberKeys()).toEqual([]);
        expect(targetSearch.entityService.findSlotByKey(targetSearch.entityStoreSlot, 'c1')?.entity?.title).toBe('alpha');
        targetPersistor.destroy();
    });
});

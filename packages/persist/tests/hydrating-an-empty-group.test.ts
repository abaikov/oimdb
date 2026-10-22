import type { TOIMBucketSlotsArrayStore, TOIMEntitySlot, TOIMStoreKey } from '@oimdb/core';
import { OIMDB, createOIMBucketService, createOIMEntityService } from '@oimdb/core';
import type { TOIMPersistRecords } from '../src';
import {
    OIMPersistRecordSourceBucketDriven,
    OIMPersistResourceRecords,
    OIMPersistSchedulerFrameDriven,
    OIMPersistor,
} from '../src';
import { OIMTestPersistBackend } from './shared/OIMTestPersistBackend';

type TCard = { id: string; deckId: string; title: string };
type TCardSlot = TOIMEntitySlot<TCard, TOIMStoreKey>;
type TCardSlots = TOIMBucketSlotsArrayStore<TCardSlot>;

const buildManual = () => {
    const db = new OIMDB();
    const entityService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
    const entityStoreSlot = entityService.createStoreSlot(db);
    const bucketService = createOIMBucketService<TCardSlot>(db);
    const bucketStoreSlot = bucketService.createStoreSlot(db);
    const firstEntitySlot = entityService.slotContentService.upsertEntity(entityStoreSlot, { id: 'c1', deckId: 'd1', title: 'alpha' });
    const secondEntitySlot = entityService.slotContentService.upsertEntity(entityStoreSlot, { id: 'c2', deckId: 'd1', title: 'beta' });
    db.flush();
    const bucketSlot = bucketService.holdSlotByKey(bucketStoreSlot, 'results');
    bucketService.slotContentService.writeBucketMemberSlots(bucketSlot, [firstEntitySlot, secondEntitySlot]);
    db.flush();
    const persistRecordSourceBucketDriven = new OIMPersistRecordSourceBucketDriven({
        channelMap: db,
        entityCollectionService: entityService,
        entityStoreSlot,
        slotContentBucketService: bucketService.slotContentService,
        bucketSlot,
    });
    const readBucketKeys = (): unknown[] =>
        Array.from(bucketService.slotContentService.getBucketMemberSlots(bucketSlot)).map(entitySlot => entitySlot.key);
    return { db, entityService, entityStoreSlot, persistRecordSourceBucketDriven, readBucketKeys };
};

const hydrateFrom = async (
    db: OIMDB,
    persistRecordSourceBucketDriven: OIMPersistRecordSourceBucketDriven<TOIMStoreKey, TCard, TCardSlots, TOIMStoreKey>,
    storedRecords: TOIMPersistRecords<TOIMStoreKey, TCard> | undefined,
): Promise<void> => {
    const testPersistBackend = new OIMTestPersistBackend<TOIMStoreKey, TCard>();
    if (storedRecords !== undefined) testPersistBackend.storeRecords(storedRecords);
    const persistor = new OIMPersistor({
        persistBackend: testPersistBackend,
        persistScheduler: new OIMPersistSchedulerFrameDriven({ channelSlot: db.defaultChannelSlot }),
    });
    persistor.addPersistResource(new OIMPersistResourceRecords({
        persistRecordSource: persistRecordSourceBucketDriven,
        persistRecordsStrategy: testPersistBackend.createRecordsStrategy(),
    }));
    await persistor.hydrate();
    db.flush();
    persistor.destroy();
};

describe('hydrating stored records with no record in them', () => {
    it('empties a manual group the store says is empty', () => {
        const { db, persistRecordSourceBucketDriven, readBucketKeys } = buildManual();
        expect(readBucketKeys()).toEqual(['c1', 'c2']);

        persistRecordSourceBucketDriven.writeSnapshot({ records: [] });
        db.flush();

        expect(readBucketKeys()).toEqual([]);
    });

    it('replaces the bucket members from records that are there', () => {
        const { db, entityService, entityStoreSlot, persistRecordSourceBucketDriven, readBucketKeys } = buildManual();

        persistRecordSourceBucketDriven.writeSnapshot({
            records: [{ key: 'c2', entity: { id: 'c2', deckId: 'd1', title: 'beta' } }],
        });
        db.flush();

        expect(readBucketKeys()).toEqual(['c2']);
        expect(entityService.slotContentService.findEntityByKey(entityStoreSlot, 'c1')?.title).toBe('alpha');
    });

    it('through the persistor, empties the group on a stored empty list and leaves it on nothing stored', async () => {
        const emptyStored = buildManual();
        await hydrateFrom(emptyStored.db, emptyStored.persistRecordSourceBucketDriven, { records: [] });
        expect(emptyStored.readBucketKeys()).toEqual([]);

        const nothingStored = buildManual();
        await hydrateFrom(nothingStored.db, nothingStored.persistRecordSourceBucketDriven, undefined);
        expect(nothingStored.readBucketKeys()).toEqual(['c1', 'c2']);
    });
});

import type { TOIMBucketSlotsArrayStore, TOIMEntitySlot, TOIMStoreKey } from '@oimdb/core';
import { OIMDB } from '@oimdb/core';
import type { TOIMPersistRecords } from '../src';
import {
    OIMPersistBucketRecordSource,
    OIMPersistRecordsResource,
    OIMPersistFrameScheduler,
    OIMPersistor,
} from '../src';
import { OIMTestPersistBackend } from './shared/OIMTestPersistBackend';
import { createOIMSlotContentEntityService } from '@oimdb/core';
import { createOIMSlotCollectionService } from '@oimdb/core';
import { OIMSlotContentPositionalArrayBucketService } from '@oimdb/core';
import { OIMBucketCommands } from '@oimdb/core';

type TCard = { id: string; deckId: string; title: string };
type TCardSlot = TOIMEntitySlot<TCard, TOIMStoreKey>;
type TCardSlots = TOIMBucketSlotsArrayStore<TCardSlot>;

const buildManual = () => {
    const db = new OIMDB();
    const entityService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard>(db) });
    const entityStoreSlot = entityService.createStoreSlot(db);
    const bucketService = createOIMSlotCollectionService(db, { slotContentService: new OIMSlotContentPositionalArrayBucketService<TCardSlot>({ bucketCommands: new OIMBucketCommands({ maxCommandsPerSlot: undefined }) }) });
    const bucketStoreSlot = bucketService.createStoreSlot(db);
    const firstEntitySlot = entityService.writeSlotContentByKey(entityStoreSlot, 'c1', { id: 'c1', deckId: 'd1', title: 'alpha' });
    const secondEntitySlot = entityService.writeSlotContentByKey(entityStoreSlot, 'c2', { id: 'c2', deckId: 'd1', title: 'beta' });
    db.flush();
    const bucketSlot = bucketService.holdSlotByKey(bucketStoreSlot, 'results');
    bucketService.slotContentService.writeSlotContent(bucketSlot, [firstEntitySlot, secondEntitySlot]);
    db.flush();
    const persistBucketRecordSource = new OIMPersistBucketRecordSource({
        channelMap: db,
        entityCollectionService: entityService,
        entityStoreSlot,
        slotContentBucketService: bucketService.slotContentService,
        bucketSlot,
    });
    const readBucketKeys = (): unknown[] =>
        Array.from(bucketService.slotContentService.getBucketMemberSlots(bucketSlot)).map(entitySlot => entitySlot.key);
    return { db, entityService, entityStoreSlot, persistBucketRecordSource, readBucketKeys };
};

const hydrateFrom = async (
    db: OIMDB,
    persistBucketRecordSource: OIMPersistBucketRecordSource<TOIMStoreKey, TCard, TCardSlots>,
    storedRecords: TOIMPersistRecords<TOIMStoreKey, TCard> | undefined,
): Promise<void> => {
    const testPersistBackend = new OIMTestPersistBackend<TOIMStoreKey, TCard>();
    if (storedRecords !== undefined) testPersistBackend.storeRecords(storedRecords);
    const persistor = new OIMPersistor({
        persistBackend: testPersistBackend,
        persistScheduler: new OIMPersistFrameScheduler({ channelSlot: db.defaultChannelSlot }),
    });
    persistor.addPersistResource(new OIMPersistRecordsResource({
        persistRecordSource: persistBucketRecordSource,
        persistRecordsService: testPersistBackend.createRecordsStrategy(),
    }));
    await persistor.hydrate();
    db.flush();
    persistor.destroy();
};

describe('hydrating stored records with no record in them', () => {
    it('empties a manual group the store says is empty', () => {
        const { db, persistBucketRecordSource, readBucketKeys } = buildManual();
        expect(readBucketKeys()).toEqual(['c1', 'c2']);

        persistBucketRecordSource.writeSnapshot({ records: [] });
        db.flush();

        expect(readBucketKeys()).toEqual([]);
    });

    it('replaces the bucket members from records that are there', () => {
        const { db, entityService, entityStoreSlot, persistBucketRecordSource, readBucketKeys } = buildManual();

        persistBucketRecordSource.writeSnapshot({
            records: [{ key: 'c2', entity: { id: 'c2', deckId: 'd1', title: 'beta' } }],
        });
        db.flush();

        expect(readBucketKeys()).toEqual(['c2']);
        expect(entityService.findSlotByKey(entityStoreSlot, 'c1')?.entity?.title).toBe('alpha');
    });

    it('through the persistor, empties the group on a stored empty list and leaves it on nothing stored', async () => {
        const emptyStored = buildManual();
        await hydrateFrom(emptyStored.db, emptyStored.persistBucketRecordSource, { records: [] });
        expect(emptyStored.readBucketKeys()).toEqual([]);

        const nothingStored = buildManual();
        await hydrateFrom(nothingStored.db, nothingStored.persistBucketRecordSource, undefined);
        expect(nothingStored.readBucketKeys()).toEqual(['c1', 'c2']);
    });
});

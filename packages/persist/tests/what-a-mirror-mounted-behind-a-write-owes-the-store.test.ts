import type { TOIMBucketSlotsSetStore, TOIMEntitySlot, TOIMStoreKey } from '@oimdb/core';
import { OIMDB, OIMSlotContentSetBucketService } from '@oimdb/core';
import type { TOIMPersistRecords } from '../src';
import {
    OIMPersistBucketRecordSource,
    OIMPersistRecordsResource,
    OIMPersistFrameScheduler,
    OIMPersistSingleEntitySnapshotSource,
    OIMPersistor,
} from '../src';
import { OIMTestPersistBackend } from './shared/OIMTestPersistBackend';
import { createOIMSlotContentEntityService } from '@oimdb/core';
import { createOIMSlotCollectionService } from '@oimdb/core';
import { createOIMSingleSlotService } from '@oimdb/core';

type TUser = { id: string; name: string };
type TUserSlot = TOIMEntitySlot<TUser, TOIMStoreKey>;
type TUserSlots = TOIMBucketSlotsSetStore<TUserSlot>;
type TUserSettings = { userId: string; theme: string };

const tick = (): Promise<void> => new Promise(resolve => { setTimeout(resolve, 0); });

function build(storedRecords: TOIMPersistRecords<TOIMStoreKey, TUser>) {
    const db = new OIMDB();
    const entityCollectionService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TUser>(db) });
    const entityStoreSlot = entityCollectionService.createStoreSlot(db);
    const bucketCollectionService = createOIMSlotCollectionService(db, { slotContentService: new OIMSlotContentSetBucketService<TUserSlot>() });
    const bucketStoreSlot = bucketCollectionService.createStoreSlot(db);
    const bucketSlot = bucketCollectionService.holdSlotByKey(bucketStoreSlot, 'all');
    const testPersistBackend = new OIMTestPersistBackend<TOIMStoreKey, TUser>();
    testPersistBackend.storeRecords(storedRecords);
    const persistor = new OIMPersistor({
        persistBackend: testPersistBackend,
        persistScheduler: new OIMPersistFrameScheduler({ channelSlot: db.defaultChannelSlot }),
    });
    persistor.addPersistResource(new OIMPersistRecordsResource({
        persistRecordSource: new OIMPersistBucketRecordSource<TOIMStoreKey, TUser, TUserSlots>({
            channelMap: db,
            entityCollectionService,
            entityStoreSlot,
            slotContentBucketService: bucketCollectionService.slotContentService,
            bucketSlot,
        }),
        persistRecordsService: testPersistBackend.createRecordsStrategy(),
    }));
    return { db, entityCollectionService, entityStoreSlot, persistor, testPersistBackend };
}

describe('autosave started behind an edit of the open batch', () => {
    it('persists the edit, which no wake is coming for', async () => {
        const { db, entityCollectionService, entityStoreSlot, persistor, testPersistBackend } = build({
            records: [{ key: 'u1', entity: { id: 'u1', name: 'Ada' } }],
        });

        await persistor.hydrate();
        db.flush();

        entityCollectionService.slotContentService.updateEntity(
            entityCollectionService.getSlotByKey(entityStoreSlot, 'u1'), { name: 'Ada Lovelace' },
        );
        persistor.start();
        db.flush();
        await tick();

        expect(testPersistBackend.readWrittenDeltaUpsertAndDeletedKeys()).toEqual([{ upserts: ['u1'], deletedKeys: [] }]);
        expect(entityCollectionService.findSlotByKey(entityStoreSlot, 'u1')?.entity?.name).toBe('Ada Lovelace');
    });
});

describe('a single entity mirror subscribed behind a write of the open batch', () => {
    it('reports the write, which no wake is coming for', () => {
        const db = new OIMDB();
        const singleEntityService = createOIMSingleSlotService(db, { slotContentService: createOIMSlotContentEntityService<TUserSettings>(db) });
        const singleEntityStoreSlot = singleEntityService.createStoreSlot(db);
        singleEntityService.writeSingleSlotContent(singleEntityStoreSlot, { userId: 'u1', theme: 'dark' });
        db.flush();
        const persistSingleEntitySnapshotSource = new OIMPersistSingleEntitySnapshotSource<TUserSettings>({
            channelMap: db, singleSlotService: singleEntityService, entityStoreSlot: singleEntityStoreSlot,
        });

        persistSingleEntitySnapshotSource.writeSnapshot({ userId: 'u1', theme: 'dark' });
        singleEntityService.slotContentService.updateEntity(
            singleEntityService.getSingleSlot(singleEntityStoreSlot), { theme: 'solarized' },
        );

        let changeCount = 0;
        persistSingleEntitySnapshotSource.subscribeSnapshotChanged(() => { changeCount++; });
        db.flush();

        expect(changeCount).toBe(1);
        expect(persistSingleEntitySnapshotSource.readSnapshot()).toEqual({ userId: 'u1', theme: 'solarized' });
    });
});

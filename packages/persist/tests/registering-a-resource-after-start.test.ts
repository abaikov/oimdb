import type { TOIMBucketSlotsSetStore, TOIMEntitySlot, TOIMStoreKey } from '@oimdb/core';
import {
    OIMDB,
    OIMSlotContentBucketServiceSetDriven,
    createOIMBucketService,
    createOIMEntityService,
} from '@oimdb/core';
import type { OIMPersistKeyValueWriteBatch, TOIMPersistRecords } from '../src';
import {
    OIMPersistCodecIdentity,
    OIMPersistKeyValueBackend,
    OIMPersistKeyValueEntryStrategy,
    OIMPersistRecordSourceBucketDriven,
    OIMPersistResourceSnapshot,
    OIMPersistSchedulerFrameDriven,
    OIMPersistor,
} from '../src';
import { OIMTestKeyValueItemStorage } from './shared/OIMTestKeyValueItemStorage';

type TUser = { id: string; name: string };
type TUserSlot = TOIMEntitySlot<TUser, TOIMStoreKey>;
type TUserSlots = TOIMBucketSlotsSetStore<TUserSlot>;
type TUserPersistRecords = TOIMPersistRecords<TOIMStoreKey, TUser>;

function buildPersistor() {
    const db = new OIMDB();
    const userEntityCollectionService = createOIMEntityService<TUser>(db, { keyOf: user => user.id });
    const userEntityStoreSlot = userEntityCollectionService.createStoreSlot(db);
    const userBucketCollectionService = createOIMBucketService<
        TUserSlot, TOIMStoreKey, TUserSlots, OIMSlotContentBucketServiceSetDriven<TUserSlot>
    >(db, { slotContentService: new OIMSlotContentBucketServiceSetDriven<TUserSlot>() });
    const userBucketStoreSlot = userBucketCollectionService.createStoreSlot(db);
    const bucketSlot = userBucketCollectionService.holdSlotByKey(userBucketStoreSlot, 'all');
    const testKeyValueItemStorage = new OIMTestKeyValueItemStorage();
    const persistor = new OIMPersistor<OIMPersistKeyValueBackend, OIMPersistKeyValueWriteBatch>({
        persistBackend: new OIMPersistKeyValueBackend({ persistKeyValueStorage: testKeyValueItemStorage }),
        persistScheduler: new OIMPersistSchedulerFrameDriven({ channelSlot: db.defaultChannelSlot }),
    });
    const upsertUser = (user: TUser): void => {
        userEntityCollectionService.slotContentService.upsertEntity(userEntityStoreSlot, user);
        const userSlots: TUserSlot[] = [];
        for (const userSlot of userEntityCollectionService.getSlots(userEntityStoreSlot)) {
            if (userSlot.entity !== undefined) userSlots.push(userSlot);
        }
        userBucketCollectionService.slotContentService.writeBucketMemberSlots(bucketSlot, userSlots);
    };
    const addPersistResourceSnapshot = (storageKey: string): void => {
        persistor.addPersistResource(new OIMPersistResourceSnapshot({
            persistSnapshotSource: new OIMPersistRecordSourceBucketDriven<TOIMStoreKey, TUser, TUserSlots, TOIMStoreKey>({
                channelMap: db,
                entityCollectionService: userEntityCollectionService,
                entityStoreSlot: userEntityStoreSlot,
                slotContentBucketService: userBucketCollectionService.slotContentService,
                bucketSlot,
            }),
            persistSnapshotStrategy: new OIMPersistKeyValueEntryStrategy<TUserPersistRecords>({ storageKey }),
            persistCodec: new OIMPersistCodecIdentity<TUserPersistRecords>(),
        }));
    };
    const readStoredKeys = (storageKey: string): TOIMStoreKey[] | undefined => {
        const item = testKeyValueItemStorage.itemByStorageKey.get(storageKey);
        if (item === undefined) return undefined;
        return (JSON.parse(item) as TUserPersistRecords).records.map(persistRecord => persistRecord.key);
    };
    return { db, persistor, testKeyValueItemStorage, upsertUser, addPersistResourceSnapshot, readStoredKeys };
}

describe('a resource registered on an already-started persistor', () => {
    it('persists the frame that changed it, not the frame after', async () => {
        const { db, persistor, testKeyValueItemStorage, upsertUser, addPersistResourceSnapshot, readStoredKeys } =
            buildPersistor();

        persistor.start();
        addPersistResourceSnapshot('users');

        upsertUser({ id: 'u1', name: 'Ada' });
        db.flush();
        await persistor.whenIdle();

        expect(testKeyValueItemStorage.writtenItemsByCommit).toHaveLength(1);
        expect(readStoredKeys('users')).toEqual(['u1']);

        persistor.destroy();
    });

    it('writes the last change even when stop() follows the frame at once', async () => {
        const { db, persistor, testKeyValueItemStorage, upsertUser, addPersistResourceSnapshot, readStoredKeys } =
            buildPersistor();

        persistor.start();
        addPersistResourceSnapshot('users');

        upsertUser({ id: 'u1', name: 'Ada' });
        db.flush();
        persistor.stop();
        await persistor.whenIdle();

        expect(testKeyValueItemStorage.writtenItemsByCommit).toHaveLength(1);
        expect(readStoredKeys('users')).toEqual(['u1']);

        persistor.destroy();
    });

    it('writes every resource registered after start() in the one commit of that frame', async () => {
        const { db, persistor, testKeyValueItemStorage, upsertUser, addPersistResourceSnapshot, readStoredKeys } =
            buildPersistor();

        persistor.start();
        addPersistResourceSnapshot('users-a');
        addPersistResourceSnapshot('users-b');
        addPersistResourceSnapshot('users-c');

        upsertUser({ id: 'u1', name: 'Ada' });
        db.flush();
        await persistor.whenIdle();

        expect(testKeyValueItemStorage.writtenItemsByCommit).toHaveLength(1);
        expect(Array.from(testKeyValueItemStorage.writtenItemsByCommit[0].keys()).sort())
            .toEqual(['users-a', 'users-b', 'users-c']);
        expect(readStoredKeys('users-a')).toEqual(['u1']);
        expect(readStoredKeys('users-b')).toEqual(['u1']);
        expect(readStoredKeys('users-c')).toEqual(['u1']);

        persistor.destroy();
    });

    it('writes what the source already held when it was registered, after the next frame', async () => {
        const { db, persistor, testKeyValueItemStorage, upsertUser, addPersistResourceSnapshot, readStoredKeys } =
            buildPersistor();

        upsertUser({ id: 'u1', name: 'Ada' });
        db.flush();
        persistor.start();
        addPersistResourceSnapshot('users');

        expect(testKeyValueItemStorage.writtenItemsByCommit).toHaveLength(0);

        db.flush();
        await persistor.whenIdle();

        expect(testKeyValueItemStorage.writtenItemsByCommit).toHaveLength(1);
        expect(readStoredKeys('users')).toEqual(['u1']);

        persistor.destroy();
    });

    it('is the same behaviour a resource registered before start() has', async () => {
        const { db, persistor, testKeyValueItemStorage, upsertUser, addPersistResourceSnapshot, readStoredKeys } =
            buildPersistor();

        addPersistResourceSnapshot('users');
        persistor.start();

        upsertUser({ id: 'u1', name: 'Ada' });
        db.flush();
        await persistor.whenIdle();

        expect(testKeyValueItemStorage.writtenItemsByCommit).toHaveLength(1);
        expect(readStoredKeys('users')).toEqual(['u1']);

        persistor.destroy();
    });
});

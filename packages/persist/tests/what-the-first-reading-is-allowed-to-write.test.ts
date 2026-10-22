import type { TOIMBucketSlotsSetStore, TOIMEntitySlot, TOIMStoreKey } from '@oimdb/core';
import { OIMDB, OIMSlotContentBucketServiceSetDriven, createOIMBucketService, createOIMEntityService } from '@oimdb/core';
import type { TOIMPersistRecords } from '../src';
import {
    OIMPersistRecordSourceBucketDriven,
    OIMPersistResourceRecords,
    OIMPersistSchedulerMicrotaskDriven,
    OIMPersistor,
} from '../src';
import { OIMTestPersistBackend } from './shared/OIMTestPersistBackend';

type TUser = { id: string; name: string };
type TUserSlot = TOIMEntitySlot<TUser, TOIMStoreKey>;
type TUserSlots = TOIMBucketSlotsSetStore<TUserSlot>;
type TUserPersistRecords = TOIMPersistRecords<TOIMStoreKey, TUser>;

const tick = (): Promise<void> => new Promise(resolve => { setTimeout(resolve, 0); });

function buildUsers() {
    const db = new OIMDB();
    const userEntityService = createOIMEntityService<TUser>(db, { keyOf: user => user.id });
    const userEntityStoreSlot = userEntityService.createStoreSlot(db);
    const userBucketService = createOIMBucketService<
        TUserSlot, TOIMStoreKey, TUserSlots, OIMSlotContentBucketServiceSetDriven<TUserSlot>
    >(db, { slotContentService: new OIMSlotContentBucketServiceSetDriven<TUserSlot>() });
    const userBucketStoreSlot = userBucketService.createStoreSlot(db);
    const bucketSlot = userBucketService.holdSlotByKey(userBucketStoreSlot, 'all');
    const fileEveryUser = (): void => {
        const userSlots: TUserSlot[] = [];
        for (const userSlot of userEntityService.getSlots(userEntityStoreSlot)) {
            if (userSlot.entity !== undefined) userSlots.push(userSlot);
        }
        userBucketService.slotContentService.writeBucketMemberSlots(bucketSlot, userSlots);
    };
    const createPersistRecordSourceBucketDriven = () => new OIMPersistRecordSourceBucketDriven({
        channelMap: db,
        entityCollectionService: userEntityService,
        entityStoreSlot: userEntityStoreSlot,
        slotContentBucketService: userBucketService.slotContentService,
        bucketSlot,
    });
    return { db, userEntityService, userEntityStoreSlot, fileEveryUser, createPersistRecordSourceBucketDriven };
}

describe('starting to watch a bucket in the middle of a batch', () => {
    it('reports each key exactly once', () => {
        const { db,userEntityService, userEntityStoreSlot, fileEveryUser, createPersistRecordSourceBucketDriven } = buildUsers();
        const persistRecordSourceBucketDriven = createPersistRecordSourceBucketDriven();

        userEntityService.slotContentService.upsertEntities(userEntityStoreSlot, [
            { id: 'u1', name: 'Ada' },
            { id: 'u2', name: 'Grace' },
        ]);
        fileEveryUser();

        const reportedKeys: TOIMStoreKey[] = [];
        persistRecordSourceBucketDriven.subscribeEntitySlotChanged(userSlot => { reportedKeys.push(userSlot.key); });
        db.flush();

        expect(reportedKeys.sort()).toEqual(['u1', 'u2']);
    });

    it('still reports an entity written after the watch began, in the same batch', () => {
        const { db,userEntityService, userEntityStoreSlot, fileEveryUser, createPersistRecordSourceBucketDriven } = buildUsers();
        const persistRecordSourceBucketDriven = createPersistRecordSourceBucketDriven();

        userEntityService.slotContentService.upsertEntity(userEntityStoreSlot, { id: 'u1', name: 'Ada' });
        fileEveryUser();

        const reportedKeys: TOIMStoreKey[] = [];
        persistRecordSourceBucketDriven.subscribeEntitySlotChanged(userSlot => { reportedKeys.push(userSlot.key); });

        userEntityService.slotContentService.upsertEntity(userEntityStoreSlot, { id: 'u2', name: 'Grace' });
        fileEveryUser();
        db.flush();

        expect(reportedKeys.sort()).toEqual(['u1', 'u2']);
    });

    it('reports each key once to each of two sources over the same bucket', () => {
        const { db,userEntityService, userEntityStoreSlot, fileEveryUser, createPersistRecordSourceBucketDriven } = buildUsers();
        const firstPersistRecordSourceBucketDriven = createPersistRecordSourceBucketDriven();
        const secondPersistRecordSourceBucketDriven = createPersistRecordSourceBucketDriven();

        userEntityService.slotContentService.upsertEntity(userEntityStoreSlot, { id: 'u1', name: 'Ada' });
        fileEveryUser();

        const firstReportedKeys: TOIMStoreKey[] = [];
        const secondReportedKeys: TOIMStoreKey[] = [];
        firstPersistRecordSourceBucketDriven.subscribeEntitySlotChanged(userSlot => { firstReportedKeys.push(userSlot.key); });
        secondPersistRecordSourceBucketDriven.subscribeEntitySlotChanged(userSlot => { secondReportedKeys.push(userSlot.key); });

        db.flush();

        expect(firstReportedKeys).toEqual(['u1']);
        expect(secondReportedKeys).toEqual(['u1']);
    });

    it('reports the members to a second listener of an already watched source, once', () => {
        const { db,userEntityService, userEntityStoreSlot, fileEveryUser, createPersistRecordSourceBucketDriven } = buildUsers();
        const persistRecordSourceBucketDriven = createPersistRecordSourceBucketDriven();

        userEntityService.slotContentService.upsertEntity(userEntityStoreSlot, { id: 'u1', name: 'Ada' });
        fileEveryUser();
        persistRecordSourceBucketDriven.subscribeEntitySlotChanged(() => undefined);

        const secondReportedKeys: TOIMStoreKey[] = [];
        persistRecordSourceBucketDriven.subscribeEntitySlotChanged(userSlot => { secondReportedKeys.push(userSlot.key); });
        db.flush();

        expect(secondReportedKeys).toEqual(['u1']);
    });
});

describe('hydrate, then start autosave', () => {
    function buildPersistor(storedUserPersistRecords: TUserPersistRecords) {
        const users = buildUsers();
        const testPersistBackend = new OIMTestPersistBackend<TOIMStoreKey, TUser>();
        testPersistBackend.storeRecords(storedUserPersistRecords);
        const persistor = new OIMPersistor({
            persistBackend: testPersistBackend,
            persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
        });
        persistor.addPersistResource(new OIMPersistResourceRecords({
            persistRecordSource: users.createPersistRecordSourceBucketDriven(),
            persistRecordsStrategy: testPersistBackend.createRecordsStrategy(),
        }));
        return { ...users, persistor, testPersistBackend };
    }

    it('does not write the hydrated records back out', async () => {
        const { db,userEntityService, userEntityStoreSlot, persistor, testPersistBackend } = buildPersistor({
            records: [
                { key: 'u1', entity: { id: 'u1', name: 'Ada' } },
                { key: 'u2', entity: { id: 'u2', name: 'Grace' } },
            ],
        });

        await persistor.hydrate();
        persistor.start();
        db.flush();
        await tick();

        expect(testPersistBackend.readWrittenDeltaKeys()).toEqual([]);
        expect(testPersistBackend.writtenPersistRecordsList).toEqual([]);
        expect(userEntityService.slotContentService.findEntityByKey(userEntityStoreSlot,'u1')?.name).toBe('Ada');
        expect(userEntityService.slotContentService.findEntityByKey(userEntityStoreSlot,'u2')?.name).toBe('Grace');

        persistor.destroy();
    });

    it('does not write them back when a frame runs between the hydrate and the start either', async () => {
        const { db,persistor, testPersistBackend } = buildPersistor({
            records: [{ key: 'u1', entity: { id: 'u1', name: 'Ada' } }],
        });

        await persistor.hydrate();
        db.flush();
        persistor.start();
        db.flush();
        await tick();

        expect(testPersistBackend.readWrittenDeltaKeys()).toEqual([]);
        expect(testPersistBackend.writtenPersistRecordsList).toEqual([]);

        persistor.destroy();
    });

    it('persists every edit made after the hydrate', async () => {
        const { db,userEntityService, userEntityStoreSlot, persistor, testPersistBackend } = buildPersistor({
            records: [{ key: 'u1', entity: { id: 'u1', name: 'Ada' } }],
        });

        await persistor.hydrate();
        persistor.start();
        db.flush();
        await tick();
        expect(testPersistBackend.readWrittenDeltaKeys()).toEqual([]);

        userEntityService.slotContentService.updateEntity(userEntityService.getSlotByKey(userEntityStoreSlot, 'u1'), { name: 'Ada Lovelace' });
        db.flush();
        await tick();
        expect(testPersistBackend.readWrittenDeltaKeys()).toEqual([['u1']]);

        userEntityService.slotContentService.updateEntity(userEntityService.getSlotByKey(userEntityStoreSlot, 'u1'), { name: 'A. Lovelace' });
        db.flush();
        await tick();
        expect(testPersistBackend.readWrittenDeltaKeys()).toEqual([['u1'], ['u1']]);

        persistor.destroy();
    });

    it('persists an entity that was never hydrated', async () => {
        const { db,userEntityService, userEntityStoreSlot, fileEveryUser, persistor, testPersistBackend } = buildPersistor({
            records: [{ key: 'u1', entity: { id: 'u1', name: 'Ada' } }],
        });

        await persistor.hydrate();
        persistor.start();
        db.flush();
        await tick();

        userEntityService.slotContentService.upsertEntity(userEntityStoreSlot, { id: 'u2', name: 'Grace' });
        fileEveryUser();
        db.flush();
        await tick();

        expect(testPersistBackend.readWrittenDeltaKeys()).toEqual([['u2']]);

        persistor.destroy();
    });

    it('persists the removal of a hydrated entity from the bucket', async () => {
        const { db,userEntityService, userEntityStoreSlot, fileEveryUser, persistor, testPersistBackend } = buildPersistor({
            records: [
                { key: 'u1', entity: { id: 'u1', name: 'Ada' } },
                { key: 'u2', entity: { id: 'u2', name: 'Grace' } },
            ],
        });

        await persistor.hydrate();
        persistor.start();
        db.flush();
        await tick();

        const deletedUserSlot = userEntityService.findSlotByKey(userEntityStoreSlot, 'u2');
        if (deletedUserSlot !== undefined) userEntityService.slotContentService.deleteEntity(deletedUserSlot);
        fileEveryUser();
        db.flush();
        await tick();

        expect(testPersistBackend.readWrittenDeltaKeys()).toEqual([['u2']]);

        persistor.destroy();
    });
});

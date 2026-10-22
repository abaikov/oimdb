import type { TOIMBucketSlotsSetStore, TOIMEntitySlot, TOIMStoreKey } from '@oimdb/core';
import {
    OIMBucketArrayMembershipNonUnique,
    OIMDB,
    OIMSlotContentBucketServiceArrayDriven,
    OIMSlotContentBucketServiceSetDriven,
    createOIMBucketService,
    createOIMEntityService,
    createOIMSingleEntityService,
} from '@oimdb/core';
import type { TOIMPersistRecords } from '../src';
import {
    OIMPersistRecordSourceBucketDriven,
    OIMPersistResourceRecords,
    OIMPersistSchedulerFrameDriven,
    OIMPersistSnapshotSourceSingleEntityDriven,
    OIMPersistor,
} from '../src';
import { OIMTestPersistBackend } from './shared/OIMTestPersistBackend';

type TUser = { id: string; name: string; score?: number };
type TUserSlot = TOIMEntitySlot<TUser, TOIMStoreKey>;
type TUserSlots = TOIMBucketSlotsSetStore<TUserSlot>;
type TUserSettings = { userId: string; theme: string };

const tick = (): Promise<void> => new Promise(resolve => { setTimeout(resolve, 0); });

function build(storedRecords: TOIMPersistRecords<TOIMStoreKey, TUser>) {
    const db = new OIMDB();
    const entityService = createOIMEntityService<TUser>(db, { keyOf: user => user.id });
    const entityStoreSlot = entityService.createStoreSlot(db);
    const bucketService = createOIMBucketService<
        TUserSlot, TOIMStoreKey, TUserSlots, OIMSlotContentBucketServiceSetDriven<TUserSlot>
    >(db, { slotContentService: new OIMSlotContentBucketServiceSetDriven<TUserSlot>() });
    const bucketStoreSlot = bucketService.createStoreSlot(db);
    const bucketSlot = bucketService.holdSlotByKey(bucketStoreSlot, 'all');
    const testPersistBackend = new OIMTestPersistBackend<TOIMStoreKey, TUser>();
    testPersistBackend.storeRecords(storedRecords);
    const persistor = new OIMPersistor({
        persistBackend: testPersistBackend,
        persistScheduler: new OIMPersistSchedulerFrameDriven({ channelSlot: db.defaultChannelSlot }),
    });
    const persistResourceRecords = persistor.addPersistResource(new OIMPersistResourceRecords({
        persistRecordSource: new OIMPersistRecordSourceBucketDriven({
            channelMap: db,
            entityCollectionService: entityService,
            entityStoreSlot,
            slotContentBucketService: bucketService.slotContentService,
            bucketSlot,
        }),
        persistRecordsStrategy: testPersistBackend.createRecordsStrategy(),
    }));
    const refileWholePopulation = (): void => {
        const entitySlots: TUserSlot[] = [];
        for (const entitySlot of entityService.getSlots(entityStoreSlot)) {
            if (entitySlot.entity !== undefined) entitySlots.push(entitySlot);
        }
        bucketService.slotContentService.writeBucketMemberSlots(bucketSlot, entitySlots);
    };
    return {
        db, entityService, entityStoreSlot, bucketService, bucketSlot, persistor, persistResourceRecords, testPersistBackend,
        refileWholePopulation,
    };
}

function buildNonUniqueArrayDriven(storedRecords: TOIMPersistRecords<TOIMStoreKey, TUser>) {
    const db = new OIMDB();
    const entityService = createOIMEntityService<TUser>(db, { keyOf: user => user.id });
    const entityStoreSlot = entityService.createStoreSlot(db);
    const bucketServiceArrayDriven = createOIMBucketService<TUserSlot>(db, {
        slotContentService: new OIMSlotContentBucketServiceArrayDriven<TUserSlot>({
            bucketArrayMembership: new OIMBucketArrayMembershipNonUnique<TUserSlot>(),
        }),
    });
    const bucketStoreSlot = bucketServiceArrayDriven.createStoreSlot(db);
    const bucketSlot = bucketServiceArrayDriven.holdSlotByKey(bucketStoreSlot, 'all');
    const testPersistBackend = new OIMTestPersistBackend<TOIMStoreKey, TUser>();
    testPersistBackend.storeRecords(storedRecords);
    const persistor = new OIMPersistor({
        persistBackend: testPersistBackend,
        persistScheduler: new OIMPersistSchedulerFrameDriven({ channelSlot: db.defaultChannelSlot }),
    });
    const persistRecordSourceBucketDriven = new OIMPersistRecordSourceBucketDriven({
        channelMap: db,
        entityCollectionService: entityService,
        entityStoreSlot,
        slotContentBucketService: bucketServiceArrayDriven.slotContentService,
        bucketSlot,
    });
    const persistResourceRecords = persistor.addPersistResource(new OIMPersistResourceRecords({
        persistRecordSource: persistRecordSourceBucketDriven,
        persistRecordsStrategy: testPersistBackend.createRecordsStrategy(),
    }));
    return {
        db, entityService, entityStoreSlot, bucketServiceArrayDriven, bucketSlot, persistor, persistRecordSourceBucketDriven,
        persistResourceRecords, testPersistBackend,
    };
}

describe('a hydrated entity holding a NaN column', () => {
    it('is the restored value, so a flush writes nothing back', async () => {
        const { db, entityService, entityStoreSlot, persistor, testPersistBackend } = build({
            records: [{ key: 'u1', entity: { id: 'u1', name: 'Ada', score: NaN } }],
        });

        await persistor.hydrate();
        persistor.start();
        db.flush();
        await tick();

        expect(Number.isNaN(entityService.slotContentService.findEntityByKey(entityStoreSlot,'u1')?.score)).toBe(true);
        expect(testPersistBackend.readWrittenDeltaUpsertAndDeletedKeys()).toEqual([]);
        expect(testPersistBackend.writtenPersistRecordsList).toEqual([]);
        expect(testPersistBackend.commitCount).toBe(0);

        persistor.destroy();
    });
});

describe('an entity deleted in the batch the hydrate restored it in', () => {
    it('is persisted as a deletion', async () => {
        const { db, entityService, entityStoreSlot, persistor, testPersistBackend, refileWholePopulation } = build({
            records: [
                { key: 'u1', entity: { id: 'u1', name: 'Ada' } },
                { key: 'u2', entity: { id: 'u2', name: 'Grace' } },
                { key: 'u3', entity: { id: 'u3', name: 'Hedy' } },
            ],
        });

        await persistor.hydrate();
        persistor.start();
        const deletedEntitySlot = entityService.findSlotByKey(entityStoreSlot, 'u3');
        if (deletedEntitySlot !== undefined) entityService.slotContentService.deleteEntity(deletedEntitySlot);
        refileWholePopulation();
        db.flush();
        await tick();

        expect(testPersistBackend.readWrittenDeltaUpsertAndDeletedKeys()).toEqual([{ upserts: [], deletedKeys: ['u3'] }]);
        expect(entityService.slotContentService.findEntityByKey(entityStoreSlot,'u1')?.name).toBe('Ada');
    });
});

describe('an entity edited in the batch the hydrate restored it in', () => {
    it('is persisted', async () => {
        const { db, entityService, entityStoreSlot, persistor, testPersistBackend } = build({
            records: [{ key: 'u1', entity: { id: 'u1', name: 'Ada' } }],
        });

        await persistor.hydrate();
        persistor.start();
        entityService.slotContentService.updateEntity(entityService.getSlotByKey(entityStoreSlot, 'u1'), { name: 'Ada Lovelace' });
        db.flush();
        await tick();

        expect(testPersistBackend.readWrittenDeltaUpsertAndDeletedKeys()).toEqual([{ upserts: ['u1'], deletedKeys: [] }]);
        expect(entityService.slotContentService.findEntityByKey(entityStoreSlot,'u1')?.name).toBe('Ada Lovelace');
    });

    it('and a restore that lands ON TOP of an edit is still not written back', async () => {
        const { db, entityService, entityStoreSlot, persistor, testPersistBackend, refileWholePopulation } = build({
            records: [{ key: 'u1', entity: { id: 'u1', name: 'Ada' } }],
        });

        entityService.slotContentService.upsertEntity(entityStoreSlot, { id: 'u1', name: 'typed by the user' });
        refileWholePopulation();
        await persistor.hydrate();
        persistor.start();
        db.flush();
        await tick();

        expect(testPersistBackend.readWrittenDeltaUpsertAndDeletedKeys()).toEqual([]);
        expect(testPersistBackend.writtenPersistRecordsList).toEqual([]);
        expect(entityService.slotContentService.findEntityByKey(entityStoreSlot,'u1')?.name).toBe('Ada');
    });

    it('is persisted when the edit is separated from the mount by a flush', async () => {
        const { db, entityService, entityStoreSlot, persistor, testPersistBackend } = build({
            records: [{ key: 'u1', entity: { id: 'u1', name: 'Ada' } }],
        });

        await persistor.hydrate();
        entityService.slotContentService.updateEntity(entityService.getSlotByKey(entityStoreSlot, 'u1'), { name: 'Ada Lovelace' });
        db.flush();
        persistor.start();
        db.flush();
        await tick();

        expect(testPersistBackend.readWrittenDeltaUpsertAndDeletedKeys()).toEqual([{ upserts: ['u1'], deletedKeys: [] }]);
    });
});

describe('a second restore', () => {
    it('does not re-exempt a key the first one restored', async () => {
        const { db, entityService, entityStoreSlot, persistor, testPersistBackend, refileWholePopulation } = build({
            records: [{ key: 'u1', entity: { id: 'u1', name: 'Ada' } }],
        });

        await persistor.hydrate();
        persistor.start();
        db.flush();
        await tick();
        expect(testPersistBackend.readWrittenDeltaUpsertAndDeletedKeys()).toEqual([]);

        testPersistBackend.storeRecords({ records: [{ key: 'u2', entity: { id: 'u2', name: 'Grace' } }] });
        await persistor.hydrate();
        refileWholePopulation();
        entityService.slotContentService.updateEntity(entityService.getSlotByKey(entityStoreSlot, 'u1'), { name: 'Ada Lovelace' });
        db.flush();
        await tick();

        expect(testPersistBackend.readWrittenDeltaUpsertAndDeletedKeys()).toEqual([{ upserts: ['u1'], deletedKeys: [] }]);
    });
});

describe('a deletion the unload restored', () => {
    it('is not written, and a later real deletion of the same key is', async () => {
        const { db, entityService, entityStoreSlot, persistor, persistResourceRecords, testPersistBackend, refileWholePopulation } = build({
            records: [
                { key: 'u1', entity: { id: 'u1', name: 'Ada' } },
                { key: 'u2', entity: { id: 'u2', name: 'Grace' } },
            ],
        });
        await persistor.hydrate();
        persistor.start();
        db.flush();
        await tick();

        await persistor.unload(persistResourceRecords, ['u1']);
        refileWholePopulation();
        db.flush();
        await tick();

        expect(entityService.slotContentService.findEntityByKey(entityStoreSlot,'u1')).toBeUndefined();
        expect(testPersistBackend.readStoredEntities()).toEqual([
            ['u1', { id: 'u1', name: 'Ada' }],
            ['u2', { id: 'u2', name: 'Grace' }],
        ]);

        entityService.slotContentService.upsertEntity(entityStoreSlot, { id: 'u1', name: 'Ada Lovelace' });
        refileWholePopulation();
        db.flush();
        await tick();
        const deletedEntitySlot = entityService.findSlotByKey(entityStoreSlot, 'u1');
        if (deletedEntitySlot !== undefined) entityService.slotContentService.deleteEntity(deletedEntitySlot);
        refileWholePopulation();
        db.flush();
        await tick();

        expect(testPersistBackend.readStoredEntities()).toEqual([['u2', { id: 'u2', name: 'Grace' }]]);

        persistor.destroy();
    });

    it('is not remembered for a key that was no bucket member, so its later real departure is written', async () => {
        const { db, entityService, entityStoreSlot, persistor, persistResourceRecords, testPersistBackend, refileWholePopulation } = build({
            records: [{ key: 'u1', entity: { id: 'u1', name: 'Ada' } }],
        });
        await persistor.hydrate();
        persistor.start();
        db.flush();
        await tick();
        entityService.slotContentService.upsertEntity(entityStoreSlot, { id: 'u3', name: 'Hedy' });
        db.flush();
        await tick();

        await persistor.unload(persistResourceRecords, ['u3']);
        db.flush();
        await tick();
        expect(entityService.slotContentService.findEntityByKey(entityStoreSlot,'u3')).toBeUndefined();

        entityService.slotContentService.upsertEntity(entityStoreSlot, { id: 'u3', name: 'Hedy Lamarr' });
        refileWholePopulation();
        db.flush();
        await tick();
        expect(testPersistBackend.readStoredEntities()).toEqual([
            ['u1', { id: 'u1', name: 'Ada' }],
            ['u3', { id: 'u3', name: 'Hedy Lamarr' }],
        ]);

        const deletedEntitySlot = entityService.findSlotByKey(entityStoreSlot, 'u3');
        if (deletedEntitySlot !== undefined) entityService.slotContentService.deleteEntity(deletedEntitySlot);
        refileWholePopulation();
        db.flush();
        await tick();

        expect(testPersistBackend.readStoredEntities()).toEqual([['u1', { id: 'u1', name: 'Ada' }]]);
        const writtenDeltaUpsertAndDeletedKeys = testPersistBackend.readWrittenDeltaUpsertAndDeletedKeys();
        expect(writtenDeltaUpsertAndDeletedKeys[writtenDeltaUpsertAndDeletedKeys.length - 1]).toEqual({ upserts: [], deletedKeys: ['u3'] });

        persistor.destroy();
    });
});

describe('an edit of a key the unload is writing', () => {
    it('is written when no flush reported it before the commit resolved', async () => {
        const { db, entityService, entityStoreSlot, persistor, persistResourceRecords, testPersistBackend, refileWholePopulation } = build({
            records: [
                { key: 'u1', entity: { id: 'u1', name: 'Ada' } },
                { key: 'u2', entity: { id: 'u2', name: 'Grace' } },
            ],
        });
        await persistor.hydrate();
        persistor.start();
        db.flush();
        await tick();
        testPersistBackend.closeGate();

        const unloaded = persistor.unload(persistResourceRecords, ['u1']);
        await tick();
        entityService.slotContentService.updateEntity(entityService.getSlotByKey(entityStoreSlot, 'u1'), { name: 'Ada Lovelace' });
        testPersistBackend.openGate();
        await unloaded;

        expect(entityService.slotContentService.findEntityByKey(entityStoreSlot,'u1')).toBeUndefined();
        expect(testPersistBackend.readStoredEntities()).toEqual([
            ['u1', { id: 'u1', name: 'Ada Lovelace' }],
            ['u2', { id: 'u2', name: 'Grace' }],
        ]);

        refileWholePopulation();
        db.flush();
        await tick();

        expect(testPersistBackend.readStoredEntities()).toEqual([
            ['u1', { id: 'u1', name: 'Ada Lovelace' }],
            ['u2', { id: 'u2', name: 'Grace' }],
        ]);

        persistor.destroy();
    });
});

describe('a bucket member the load brought back', () => {
    it('is in the collection and in the bucket again, and a flush writes nothing back', async () => {
        const {
            db, entityService, entityStoreSlot, bucketService, bucketSlot, persistor, persistResourceRecords, testPersistBackend,
            refileWholePopulation,
        } = build({
            records: [
                { key: 'u1', entity: { id: 'u1', name: 'Ada' } },
                { key: 'u2', entity: { id: 'u2', name: 'Grace' } },
            ],
        });
        await persistor.hydrate();
        persistor.start();
        db.flush();
        await tick();
        await persistor.unload(persistResourceRecords, ['u1']);
        refileWholePopulation();
        db.flush();
        await tick();
        expect(entityService.slotContentService.findEntityByKey(entityStoreSlot,'u1')).toBeUndefined();
        const writtenDeltaCountBefore = testPersistBackend.writtenPersistRecordsDeltas.length;
        const commitCountBefore = testPersistBackend.commitCount;

        await persistor.load(persistResourceRecords, ['u1']);
        db.flush();
        await tick();

        expect(entityService.slotContentService.findEntityByKey(entityStoreSlot,'u1')).toEqual({ id: 'u1', name: 'Ada' });
        expect(Array.from(
            bucketService.slotContentService.getBucketMemberSlots(bucketSlot),
            entitySlot => entitySlot.key,
        ).sort()).toEqual(['u1', 'u2']);
        expect(testPersistBackend.writtenPersistRecordsDeltas.length).toBe(writtenDeltaCountBefore);
        expect(testPersistBackend.commitCount).toBe(commitCountBefore);
        expect(testPersistBackend.readStoredEntities()).toEqual([
            ['u1', { id: 'u1', name: 'Ada' }],
            ['u2', { id: 'u2', name: 'Grace' }],
        ]);

        persistor.destroy();
    });

    it('is not loaded over a value upserted into the collection before the load, even with no flush between', async () => {
        const { db, entityService, entityStoreSlot, persistor, persistResourceRecords, testPersistBackend, refileWholePopulation } = build({
            records: [
                { key: 'u1', entity: { id: 'u1', name: 'Ada' } },
                { key: 'u2', entity: { id: 'u2', name: 'Grace' } },
            ],
        });
        await persistor.hydrate();
        persistor.start();
        db.flush();
        await tick();
        await persistor.unload(persistResourceRecords, ['u1']);
        refileWholePopulation();
        db.flush();
        await tick();
        expect(entityService.slotContentService.findEntityByKey(entityStoreSlot,'u1')).toBeUndefined();

        entityService.slotContentService.upsertEntity(entityStoreSlot, { id: 'u1', name: 'Ada Lovelace' });
        await persistor.load(persistResourceRecords, ['u1']);

        expect(entityService.slotContentService.findEntityByKey(entityStoreSlot,'u1')).toEqual({ id: 'u1', name: 'Ada Lovelace' });
        expect(testPersistBackend.readStoredEntities()).toEqual([
            ['u1', { id: 'u1', name: 'Ada' }],
            ['u2', { id: 'u2', name: 'Grace' }],
        ]);

        persistor.destroy();
    });

    it('is listed once in a bucket that may hold a member twice, when the unload left its slot in the bucket', async () => {
        const {
            db, entityService, entityStoreSlot, bucketServiceArrayDriven, bucketSlot, persistor, persistRecordSourceBucketDriven,
            persistResourceRecords,
        } = buildNonUniqueArrayDriven({
            records: [
                { key: 'u1', entity: { id: 'u1', name: 'Ada' } },
                { key: 'u2', entity: { id: 'u2', name: 'Grace' } },
            ],
        });
        await persistor.hydrate();
        persistor.start();
        db.flush();
        await tick();
        await persistor.unload(persistResourceRecords, ['u1']);
        db.flush();
        await tick();
        expect(entityService.slotContentService.findEntityByKey(entityStoreSlot,'u1')).toBeUndefined();
        expect(bucketServiceArrayDriven.slotContentService.getBucketMemberSlotCount(bucketSlot)).toBe(2);

        await persistor.load(persistResourceRecords, ['u1']);
        db.flush();
        await tick();

        expect(entityService.slotContentService.findEntityByKey(entityStoreSlot,'u1')).toEqual({ id: 'u1', name: 'Ada' });
        expect(bucketServiceArrayDriven.slotContentService.getBucketMemberSlotCount(bucketSlot)).toBe(2);
        expect(Array.from(
            bucketServiceArrayDriven.slotContentService.getBucketMemberSlots(bucketSlot),
            entitySlot => entitySlot.key,
        ).sort()).toEqual(['u1', 'u2']);
        expect(persistRecordSourceBucketDriven.readSnapshot().records.map(persistRecord => persistRecord.key).sort())
            .toEqual(['u1', 'u2']);

        persistor.destroy();
    });
});

describe('an unload on a stopped persistor', () => {
    it('remembers the deletion of a bucket member, so a start before the refile writes no deletion', async () => {
        const { db, entityService, entityStoreSlot, persistor, persistResourceRecords, testPersistBackend, refileWholePopulation } = build({
            records: [
                { key: 'u1', entity: { id: 'u1', name: 'Ada' } },
                { key: 'u2', entity: { id: 'u2', name: 'Grace' } },
            ],
        });
        await persistor.hydrate();
        persistor.start();
        db.flush();
        await tick();

        persistor.stop();
        await persistor.unload(persistResourceRecords, ['u1']);
        persistor.start();
        refileWholePopulation();
        db.flush();
        await tick();

        expect(entityService.slotContentService.findEntityByKey(entityStoreSlot,'u1')).toBeUndefined();
        expect(testPersistBackend.readWrittenDeltaUpsertAndDeletedKeys().flatMap(persistRecordsDelta => persistRecordsDelta.deletedKeys))
            .toEqual([]);
        expect(testPersistBackend.readStoredEntities()).toEqual([
            ['u1', { id: 'u1', name: 'Ada' }],
            ['u2', { id: 'u2', name: 'Grace' }],
        ]);

        persistor.destroy();
    });
});

describe('the single entity source', () => {
    it('keeps a matched restore until a different value is seen, then forgets it', () => {
        const db = new OIMDB();
        const singleEntityService = createOIMSingleEntityService<TUserSettings>(db);
        const singleEntityStoreSlot = singleEntityService.createStoreSlot(db);
        const singleEntitySlot = singleEntityService.slotContentService.upsertEntity(
            singleEntityStoreSlot, { userId: 'u1', theme: 'dark' },
        );
        db.flush();
        const persistSnapshotSourceSingleEntityDriven = new OIMPersistSnapshotSourceSingleEntityDriven({
            channelMap: db, singleSlotService: singleEntityService, entityStoreSlot: singleEntityStoreSlot,
        });
        let firstChangeCount = 0;
        persistSnapshotSourceSingleEntityDriven.subscribeSnapshotChanged(() => { firstChangeCount++; });

        persistSnapshotSourceSingleEntityDriven.writeSnapshot({ userId: 'u1', theme: 'light' });
        db.flush();
        let secondChangeCount = 0;
        persistSnapshotSourceSingleEntityDriven.subscribeSnapshotChanged(() => { secondChangeCount++; });
        expect(firstChangeCount).toBe(1);
        expect(secondChangeCount).toBe(0);

        singleEntityService.slotContentService.updateEntity(singleEntitySlot, { theme: 'solarized' });
        db.flush();
        singleEntityService.slotContentService.updateEntity(singleEntitySlot, { theme: 'light' });
        db.flush();

        expect(firstChangeCount).toBe(3);
        expect(secondChangeCount).toBe(2);
    });

    it('reports a change made in the batch its restore wrote in', () => {
        const db = new OIMDB();
        const singleEntityService = createOIMSingleEntityService<TUserSettings>(db);
        const singleEntityStoreSlot = singleEntityService.createStoreSlot(db);
        const singleEntitySlot = singleEntityService.slotContentService.upsertEntity(
            singleEntityStoreSlot, { userId: 'u1', theme: 'dark' },
        );
        db.flush();
        const persistSnapshotSourceSingleEntityDriven = new OIMPersistSnapshotSourceSingleEntityDriven({
            channelMap: db, singleSlotService: singleEntityService, entityStoreSlot: singleEntityStoreSlot,
        });

        persistSnapshotSourceSingleEntityDriven.writeSnapshot({ userId: 'u1', theme: 'dark' });

        let changeCount = 0;
        persistSnapshotSourceSingleEntityDriven.subscribeSnapshotChanged(() => { changeCount++; });

        persistSnapshotSourceSingleEntityDriven.writeSnapshot({ userId: 'u1', theme: 'light' });
        singleEntityService.slotContentService.updateEntity(singleEntitySlot, { theme: 'solarized' });
        db.flush();

        expect(changeCount).toBe(1);
        expect(persistSnapshotSourceSingleEntityDriven.readSnapshot()).toEqual({ userId: 'u1', theme: 'solarized' });
    });

    it('and still says nothing when its restore lands on top of a change', () => {
        const db = new OIMDB();
        const singleEntityService = createOIMSingleEntityService<TUserSettings>(db);
        const singleEntityStoreSlot = singleEntityService.createStoreSlot(db);
        const singleEntitySlot = singleEntityService.slotContentService.upsertEntity(
            singleEntityStoreSlot, { userId: 'u1', theme: 'dark' },
        );
        db.flush();
        const persistSnapshotSourceSingleEntityDriven = new OIMPersistSnapshotSourceSingleEntityDriven({
            channelMap: db, singleSlotService: singleEntityService, entityStoreSlot: singleEntityStoreSlot,
        });

        persistSnapshotSourceSingleEntityDriven.writeSnapshot({ userId: 'u1', theme: 'dark' });

        let changeCount = 0;
        persistSnapshotSourceSingleEntityDriven.subscribeSnapshotChanged(() => { changeCount++; });

        singleEntityService.slotContentService.updateEntity(singleEntitySlot, { theme: 'solarized' });
        persistSnapshotSourceSingleEntityDriven.writeSnapshot({ userId: 'u1', theme: 'light' });
        db.flush();

        expect(changeCount).toBe(0);
        expect(persistSnapshotSourceSingleEntityDriven.readSnapshot()).toEqual({ userId: 'u1', theme: 'light' });
    });
});

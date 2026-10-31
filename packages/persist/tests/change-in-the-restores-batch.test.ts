import type { TOIMEntitySlot, TOIMStoreKey } from '@oimdb/core';
import { OIMDB, OIMPositionalArrayBucketContentService, OIMSetBucketContentService } from '@oimdb/core';
import type { TOIMPersistRecords } from '../src';
import {
    OIMPersistBucketRecordSource,
    OIMPersistRecordsResource,
    OIMPersistFrameScheduler,
    OIMPersistSingleEntitySnapshotSource,
    OIMPersistor,
} from '../src';
import { OIMTestPersistBackend } from './shared/OIMTestPersistBackend';
import { createOIMEntityContentService } from '@oimdb/core';
import { createOIMSlotCollectionService } from '@oimdb/core';
import { createOIMSingleSlotService } from '@oimdb/core';

type TUser = { id: string; name: string; score?: number };
type TUserSlot = TOIMEntitySlot<TUser, TOIMStoreKey>;
type TUserSettings = { userId: string; theme: string };

const tick = (): Promise<void> => new Promise(resolve => { setTimeout(resolve, 0); });

function build(storedRecords: TOIMPersistRecords<TOIMStoreKey, TUser>) {
    const db = new OIMDB();
    const entityService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TUser>() });
    const entityStoreSlot = entityService.createStoreSlot(db);
    const bucketService = createOIMSlotCollectionService({ slotContentService: new OIMSetBucketContentService<TUserSlot>() });
    const bucketStoreSlot = bucketService.createStoreSlot(db);
    const bucketSlot = bucketService.holdSlotByKey(bucketStoreSlot, 'all');
    const testPersistBackend = new OIMTestPersistBackend<TOIMStoreKey, TUser>();
    testPersistBackend.storeRecords(storedRecords);
    const persistor = new OIMPersistor({
        persistBackend: testPersistBackend,
        persistScheduler: new OIMPersistFrameScheduler({ channelSlot: db.defaultChannelSlot }),
    });
    const persistRecordsResource = persistor.addPersistResource(new OIMPersistRecordsResource({
        persistRecordSource: new OIMPersistBucketRecordSource({
            channelMap: db,
            entityCollectionService: entityService,
            entityStoreSlot,
            bucketContentService: bucketService.slotContentService,
            bucketSlot,
        }),
        persistRecordsService: testPersistBackend.createRecordsStrategy(),
    }));
    const refileWholePopulation = (): void => {
        const entitySlots: TUserSlot[] = [];
        for (const entitySlot of entityService.getSlots(entityStoreSlot)) {
            if (entitySlot.entity !== undefined) entitySlots.push(entitySlot);
        }
        bucketService.slotContentService.writeSlotContent(bucketSlot, entitySlots);
    };
    return {
        db, entityService, entityStoreSlot, bucketService, bucketSlot, persistor, persistRecordsResource, testPersistBackend,
        refileWholePopulation,
    };
}

function buildNonUniqueArrayDriven(storedRecords: TOIMPersistRecords<TOIMStoreKey, TUser>) {
    const db = new OIMDB();
    const entityService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TUser>() });
    const entityStoreSlot = entityService.createStoreSlot(db);
    const bucketServiceArrayDriven = createOIMSlotCollectionService({
        slotContentService: new OIMPositionalArrayBucketContentService<TUserSlot>(),
    });
    const bucketStoreSlot = bucketServiceArrayDriven.createStoreSlot(db);
    const bucketSlot = bucketServiceArrayDriven.holdSlotByKey(bucketStoreSlot, 'all');
    const testPersistBackend = new OIMTestPersistBackend<TOIMStoreKey, TUser>();
    testPersistBackend.storeRecords(storedRecords);
    const persistor = new OIMPersistor({
        persistBackend: testPersistBackend,
        persistScheduler: new OIMPersistFrameScheduler({ channelSlot: db.defaultChannelSlot }),
    });
    const persistBucketRecordSource = new OIMPersistBucketRecordSource({
        channelMap: db,
        entityCollectionService: entityService,
        entityStoreSlot,
        bucketContentService: bucketServiceArrayDriven.slotContentService,
        bucketSlot,
    });
    const persistRecordsResource = persistor.addPersistResource(new OIMPersistRecordsResource({
        persistRecordSource: persistBucketRecordSource,
        persistRecordsService: testPersistBackend.createRecordsStrategy(),
    }));
    return {
        db, entityService, entityStoreSlot, bucketServiceArrayDriven, bucketSlot, persistor, persistBucketRecordSource,
        persistRecordsResource, testPersistBackend,
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

        expect(Number.isNaN(entityService.findSlotByKey(entityStoreSlot, 'u1')?.entity?.score)).toBe(true);
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
        if (deletedEntitySlot !== undefined) entityService.slotContentService.clearSlotContent(deletedEntitySlot);
        refileWholePopulation();
        db.flush();
        await tick();

        expect(testPersistBackend.readWrittenDeltaUpsertAndDeletedKeys()).toEqual([{ upserts: [], deletedKeys: ['u3'] }]);
        expect(entityService.findSlotByKey(entityStoreSlot, 'u1')?.entity?.name).toBe('Ada');
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
        expect(entityService.findSlotByKey(entityStoreSlot, 'u1')?.entity?.name).toBe('Ada Lovelace');
    });

    it('and a restore that lands ON TOP of an edit is still not written back', async () => {
        const { db, entityService, entityStoreSlot, persistor, testPersistBackend, refileWholePopulation } = build({
            records: [{ key: 'u1', entity: { id: 'u1', name: 'Ada' } }],
        });

        entityService.writeSlotContentByKey(entityStoreSlot, 'u1', { id: 'u1', name: 'typed by the user' });
        refileWholePopulation();
        await persistor.hydrate();
        persistor.start();
        db.flush();
        await tick();

        expect(testPersistBackend.readWrittenDeltaUpsertAndDeletedKeys()).toEqual([]);
        expect(testPersistBackend.writtenPersistRecordsList).toEqual([]);
        expect(entityService.findSlotByKey(entityStoreSlot, 'u1')?.entity?.name).toBe('Ada');
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
        const { db, entityService, entityStoreSlot, persistor, persistRecordsResource, testPersistBackend, refileWholePopulation } = build({
            records: [
                { key: 'u1', entity: { id: 'u1', name: 'Ada' } },
                { key: 'u2', entity: { id: 'u2', name: 'Grace' } },
            ],
        });
        await persistor.hydrate();
        persistor.start();
        db.flush();
        await tick();

        await persistor.unload(persistRecordsResource, ['u1']);
        refileWholePopulation();
        db.flush();
        await tick();

        expect(entityService.findSlotByKey(entityStoreSlot, 'u1')?.entity).toBeUndefined();
        expect(testPersistBackend.readStoredEntities()).toEqual([
            ['u1', { id: 'u1', name: 'Ada' }],
            ['u2', { id: 'u2', name: 'Grace' }],
        ]);

        entityService.writeSlotContentByKey(entityStoreSlot, 'u1', { id: 'u1', name: 'Ada Lovelace' });
        refileWholePopulation();
        db.flush();
        await tick();
        const deletedEntitySlot = entityService.findSlotByKey(entityStoreSlot, 'u1');
        if (deletedEntitySlot !== undefined) entityService.slotContentService.clearSlotContent(deletedEntitySlot);
        refileWholePopulation();
        db.flush();
        await tick();

        expect(testPersistBackend.readStoredEntities()).toEqual([['u2', { id: 'u2', name: 'Grace' }]]);

        persistor.destroy();
    });

    it('is not remembered for a key that was no bucket member, so its later real departure is written', async () => {
        const { db, entityService, entityStoreSlot, persistor, persistRecordsResource, testPersistBackend, refileWholePopulation } = build({
            records: [{ key: 'u1', entity: { id: 'u1', name: 'Ada' } }],
        });
        await persistor.hydrate();
        persistor.start();
        db.flush();
        await tick();
        entityService.writeSlotContentByKey(entityStoreSlot, 'u3', { id: 'u3', name: 'Hedy' });
        db.flush();
        await tick();

        await persistor.unload(persistRecordsResource, ['u3']);
        db.flush();
        await tick();
        expect(entityService.findSlotByKey(entityStoreSlot, 'u3')?.entity).toBeUndefined();

        entityService.writeSlotContentByKey(entityStoreSlot, 'u3', { id: 'u3', name: 'Hedy Lamarr' });
        refileWholePopulation();
        db.flush();
        await tick();
        expect(testPersistBackend.readStoredEntities()).toEqual([
            ['u1', { id: 'u1', name: 'Ada' }],
            ['u3', { id: 'u3', name: 'Hedy Lamarr' }],
        ]);

        const deletedEntitySlot = entityService.findSlotByKey(entityStoreSlot, 'u3');
        if (deletedEntitySlot !== undefined) entityService.slotContentService.clearSlotContent(deletedEntitySlot);
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
        const { db, entityService, entityStoreSlot, persistor, persistRecordsResource, testPersistBackend, refileWholePopulation } = build({
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

        const unloaded = persistor.unload(persistRecordsResource, ['u1']);
        await tick();
        entityService.slotContentService.updateEntity(entityService.getSlotByKey(entityStoreSlot, 'u1'), { name: 'Ada Lovelace' });
        testPersistBackend.openGate();
        await unloaded;

        expect(entityService.findSlotByKey(entityStoreSlot, 'u1')?.entity).toBeUndefined();
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
            db, entityService, entityStoreSlot, bucketService, bucketSlot, persistor, persistRecordsResource, testPersistBackend,
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
        await persistor.unload(persistRecordsResource, ['u1']);
        refileWholePopulation();
        db.flush();
        await tick();
        expect(entityService.findSlotByKey(entityStoreSlot, 'u1')?.entity).toBeUndefined();
        const writtenDeltaCountBefore = testPersistBackend.writtenPersistRecordsDeltas.length;
        const commitCountBefore = testPersistBackend.commitCount;

        await persistor.load(persistRecordsResource, ['u1']);
        db.flush();
        await tick();

        expect(entityService.findSlotByKey(entityStoreSlot, 'u1')?.entity).toEqual({ id: 'u1', name: 'Ada' });
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
        const { db, entityService, entityStoreSlot, persistor, persistRecordsResource, testPersistBackend, refileWholePopulation } = build({
            records: [
                { key: 'u1', entity: { id: 'u1', name: 'Ada' } },
                { key: 'u2', entity: { id: 'u2', name: 'Grace' } },
            ],
        });
        await persistor.hydrate();
        persistor.start();
        db.flush();
        await tick();
        await persistor.unload(persistRecordsResource, ['u1']);
        refileWholePopulation();
        db.flush();
        await tick();
        expect(entityService.findSlotByKey(entityStoreSlot, 'u1')?.entity).toBeUndefined();

        entityService.writeSlotContentByKey(entityStoreSlot, 'u1', { id: 'u1', name: 'Ada Lovelace' });
        await persistor.load(persistRecordsResource, ['u1']);

        expect(entityService.findSlotByKey(entityStoreSlot, 'u1')?.entity).toEqual({ id: 'u1', name: 'Ada Lovelace' });
        expect(testPersistBackend.readStoredEntities()).toEqual([
            ['u1', { id: 'u1', name: 'Ada' }],
            ['u2', { id: 'u2', name: 'Grace' }],
        ]);

        persistor.destroy();
    });

    it('is listed once in a bucket that may hold a member twice, when the unload left its slot in the bucket', async () => {
        const {
            db, entityService, entityStoreSlot, bucketServiceArrayDriven, bucketSlot, persistor, persistBucketRecordSource,
            persistRecordsResource,
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
        await persistor.unload(persistRecordsResource, ['u1']);
        db.flush();
        await tick();
        expect(entityService.findSlotByKey(entityStoreSlot, 'u1')?.entity).toBeUndefined();
        expect(bucketServiceArrayDriven.slotContentService.getBucketMemberSlotCount(bucketSlot)).toBe(2);

        await persistor.load(persistRecordsResource, ['u1']);
        db.flush();
        await tick();

        expect(entityService.findSlotByKey(entityStoreSlot, 'u1')?.entity).toEqual({ id: 'u1', name: 'Ada' });
        expect(bucketServiceArrayDriven.slotContentService.getBucketMemberSlotCount(bucketSlot)).toBe(2);
        expect(Array.from(
            bucketServiceArrayDriven.slotContentService.getBucketMemberSlots(bucketSlot),
            entitySlot => entitySlot.key,
        ).sort()).toEqual(['u1', 'u2']);
        expect(persistBucketRecordSource.readSnapshot().records.map(persistRecord => persistRecord.key).sort())
            .toEqual(['u1', 'u2']);

        persistor.destroy();
    });
});

describe('an unload on a stopped persistor', () => {
    it('remembers the deletion of a bucket member, so a start before the refile writes no deletion', async () => {
        const { db, entityService, entityStoreSlot, persistor, persistRecordsResource, testPersistBackend, refileWholePopulation } = build({
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
        await persistor.unload(persistRecordsResource, ['u1']);
        persistor.start();
        refileWholePopulation();
        db.flush();
        await tick();

        expect(entityService.findSlotByKey(entityStoreSlot, 'u1')?.entity).toBeUndefined();
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
        const singleEntityService = createOIMSingleSlotService({ slotContentService: createOIMEntityContentService<TUserSettings>() });
        const singleEntityStoreSlot = singleEntityService.createStoreSlot(db);
        const singleEntitySlot = singleEntityService.writeSingleSlotContent(singleEntityStoreSlot, { userId: 'u1', theme: 'dark' });
        db.flush();
        const persistSingleEntitySnapshotSource = new OIMPersistSingleEntitySnapshotSource({
            channelMap: db, singleSlotService: singleEntityService, entityStoreSlot: singleEntityStoreSlot,
        });
        let firstChangeCount = 0;
        persistSingleEntitySnapshotSource.subscribeSnapshotChanged(() => { firstChangeCount++; });

        persistSingleEntitySnapshotSource.writeSnapshot({ userId: 'u1', theme: 'light' });
        db.flush();
        let secondChangeCount = 0;
        persistSingleEntitySnapshotSource.subscribeSnapshotChanged(() => { secondChangeCount++; });
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
        const singleEntityService = createOIMSingleSlotService({ slotContentService: createOIMEntityContentService<TUserSettings>() });
        const singleEntityStoreSlot = singleEntityService.createStoreSlot(db);
        const singleEntitySlot = singleEntityService.writeSingleSlotContent(singleEntityStoreSlot, { userId: 'u1', theme: 'dark' });
        db.flush();
        const persistSingleEntitySnapshotSource = new OIMPersistSingleEntitySnapshotSource({
            channelMap: db, singleSlotService: singleEntityService, entityStoreSlot: singleEntityStoreSlot,
        });

        persistSingleEntitySnapshotSource.writeSnapshot({ userId: 'u1', theme: 'dark' });

        let changeCount = 0;
        persistSingleEntitySnapshotSource.subscribeSnapshotChanged(() => { changeCount++; });

        persistSingleEntitySnapshotSource.writeSnapshot({ userId: 'u1', theme: 'light' });
        singleEntityService.slotContentService.updateEntity(singleEntitySlot, { theme: 'solarized' });
        db.flush();

        expect(changeCount).toBe(1);
        expect(persistSingleEntitySnapshotSource.readSnapshot()).toEqual({ userId: 'u1', theme: 'solarized' });
    });

    it('and still says nothing when its restore lands on top of a change', () => {
        const db = new OIMDB();
        const singleEntityService = createOIMSingleSlotService({ slotContentService: createOIMEntityContentService<TUserSettings>() });
        const singleEntityStoreSlot = singleEntityService.createStoreSlot(db);
        const singleEntitySlot = singleEntityService.writeSingleSlotContent(singleEntityStoreSlot, { userId: 'u1', theme: 'dark' });
        db.flush();
        const persistSingleEntitySnapshotSource = new OIMPersistSingleEntitySnapshotSource({
            channelMap: db, singleSlotService: singleEntityService, entityStoreSlot: singleEntityStoreSlot,
        });

        persistSingleEntitySnapshotSource.writeSnapshot({ userId: 'u1', theme: 'dark' });

        let changeCount = 0;
        persistSingleEntitySnapshotSource.subscribeSnapshotChanged(() => { changeCount++; });

        singleEntityService.slotContentService.updateEntity(singleEntitySlot, { theme: 'solarized' });
        persistSingleEntitySnapshotSource.writeSnapshot({ userId: 'u1', theme: 'light' });
        db.flush();

        expect(changeCount).toBe(0);
        expect(persistSingleEntitySnapshotSource.readSnapshot()).toEqual({ userId: 'u1', theme: 'light' });
    });
});

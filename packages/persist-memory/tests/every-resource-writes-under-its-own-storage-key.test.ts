import type { TOIMEntitySlot, TOIMStoreKey, TOIMStoreSlot } from '@oimdb/core';
import {
    OIMDB,
    createOIMBucketService,
    createOIMEntityService,
    createOIMEntityWriterInPlace,
    createOIMSingleEntityService,
} from '@oimdb/core';
import type {
    IOIMPersistSnapshotStrategy,
    TOIMPersistRecords,
    TOIMPersistVersionedShape,
} from '@oimdb/persist';
import {
    OIMPersistCodecIdentity,
    OIMPersistCodecVersioned,
    OIMPersistEntityWriter,
    OIMPersistRecordSourceBucketDriven,
    OIMPersistRecordSourceCollectionChangeDriven,
    OIMPersistResourceRecords,
    OIMPersistResourceSnapshot,
    OIMPersistSchedulerMicrotaskDriven,
    OIMPersistSnapshotSourceSingleEntityDriven,
    OIMPersistor,
} from '@oimdb/persist';
import type { OIMPersistMemoryWriteBatch } from '../src';
import { OIMPersistMemoryBackend, OIMPersistMemoryRecordsStrategy, OIMPersistMemorySnapshotStrategy } from '../src';

type TUser = { id: string; name: string };
type TSettings = { theme: string };
type TUserRecords = TOIMPersistRecords<TOIMStoreKey, TUser>;
type TMemoryPersistor = OIMPersistor<OIMPersistMemoryBackend, OIMPersistMemoryWriteBatch>;

const ada: TUser = { id: 'u1', name: 'Ada' };
const grace: TUser = { id: 'u2', name: 'Grace' };

function buildUsers(db: OIMDB) {
    const persistEntityWriter = new OIMPersistEntityWriter<TUser, TOIMStoreKey>({
        entityWriter: createOIMEntityWriterInPlace(),
    });
    const entityService = createOIMEntityService<TUser>(db, {
        keyOf: user => user.id,
        entityWriter: persistEntityWriter,
    });
    const entityStoreSlot = entityService.createStoreSlot(db);
    const persistRecordSource = new OIMPersistRecordSourceCollectionChangeDriven<TOIMStoreKey, TUser>({
        entityCollectionService: entityService,
        entityStoreSlot,
        persistEntityWriter,
    });
    return { entityService, entityStoreSlot, persistRecordSource };
}

function buildSettings(db: OIMDB, settings: TSettings) {
    const singleEntityService = createOIMSingleEntityService<TSettings>(db);
    const singleEntityStoreSlot = singleEntityService.createStoreSlot(db);
    singleEntityService.slotContentService.upsertEntity(singleEntityStoreSlot, settings);
    db.flush();
    const persistSnapshotSource = new OIMPersistSnapshotSourceSingleEntityDriven<TSettings>({
        channelMap: db,
        singleSlotService: singleEntityService,
        entityStoreSlot: singleEntityStoreSlot,
    });
    return { singleEntityService, singleEntityStoreSlot, persistSnapshotSource };
}

function createPersistor(persistMemoryBackend: OIMPersistMemoryBackend): TMemoryPersistor {
    return new OIMPersistor<OIMPersistMemoryBackend, OIMPersistMemoryWriteBatch>({
        persistBackend: persistMemoryBackend,
        persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
    });
}

function createUsersSnapshotResource(persistRecordSource: ReturnType<typeof buildUsers>['persistRecordSource'], storageKey: string) {
    return new OIMPersistResourceSnapshot<OIMPersistMemoryBackend, OIMPersistMemoryWriteBatch, TUserRecords, TUserRecords>({
        persistSnapshotSource: persistRecordSource,
        persistSnapshotStrategy: new OIMPersistMemorySnapshotStrategy<TUserRecords>({ storageKey }),
        persistCodec: new OIMPersistCodecIdentity<TUserRecords>(),
    });
}

function createUsersRecordsResource(persistRecordSource: ReturnType<typeof buildUsers>['persistRecordSource'], storageKey: string) {
    return new OIMPersistResourceRecords<OIMPersistMemoryBackend, OIMPersistMemoryWriteBatch, TOIMStoreKey, TUser>({
        persistRecordSource,
        persistRecordsStrategy: new OIMPersistMemoryRecordsStrategy<TOIMStoreKey, TUser>({ storageKey }),
    });
}

function entitiesOf(
    entityService: ReturnType<typeof buildUsers>['entityService'],
    entityStoreSlot: TOIMStoreSlot<Map<TOIMStoreKey, TOIMEntitySlot<TUser, TOIMStoreKey>>, TOIMEntitySlot<TUser, TOIMStoreKey>, Partial<TUser>>,
): TUser[] {
    const entities: TUser[] = [];
    for (const entitySlot of entityService.getSlots(entityStoreSlot)) {
        if (entitySlot.entity !== undefined) entities.push({ ...entitySlot.entity });
    }
    return entities;
}

function entityByKeyOf(persistMemoryBackend: OIMPersistMemoryBackend, storageKey: string): Map<unknown, unknown> | undefined {
    const persistRecords = persistMemoryBackend.readRecords(storageKey);
    if (persistRecords === undefined) return undefined;
    return new Map(persistRecords.records.map(record => [record.key, record.entity]));
}

async function settleAutosave(persistor: TMemoryPersistor): Promise<void> {
    await Promise.resolve();
    await persistor.whenIdle();
}

describe('@oimdb/persist-memory', () => {
    const startedPersistors: TMemoryPersistor[] = [];
    afterEach(() => {
        for (const persistor of startedPersistors.splice(0)) persistor.destroy();
    });

    function startAutosave(persistor: TMemoryPersistor): void {
        startedPersistors.push(persistor);
        persistor.start();
    }

    test('a snapshot one persistor wrote, a fresh persistor over the same backend hydrates', async () => {
        const persistMemoryBackend = new OIMPersistMemoryBackend();
        const sourceUsers = buildUsers(new OIMDB());
        const sourcePersistor = createPersistor(persistMemoryBackend);
        sourcePersistor.addPersistResource(createUsersSnapshotResource(sourceUsers.persistRecordSource, 'users'));
        sourceUsers.entityService.slotContentService.upsertEntities(sourceUsers.entityStoreSlot,[{ ...ada }, { ...grace }]);
        await sourcePersistor.persist();

        const targetUsers = buildUsers(new OIMDB());
        const targetPersistor = createPersistor(persistMemoryBackend);
        targetPersistor.addPersistResource(createUsersSnapshotResource(targetUsers.persistRecordSource, 'users'));
        await targetPersistor.hydrate();

        expect(entitiesOf(targetUsers.entityService, targetUsers.entityStoreSlot)).toEqual([ada, grace]);
    });

    test('a versioned codec stores its envelope and decodes it on hydrate', async () => {
        const persistCodecVersioned = new OIMPersistCodecVersioned<TUserRecords, TUserRecords>({
            version: 1,
            migrations: {},
            persistCodec: new OIMPersistCodecIdentity<TUserRecords>(),
        });
        const createVersionedResource = (persistRecordSource: ReturnType<typeof buildUsers>['persistRecordSource']) =>
            new OIMPersistResourceSnapshot<
                OIMPersistMemoryBackend, OIMPersistMemoryWriteBatch, TUserRecords, TOIMPersistVersionedShape
            >({
                persistSnapshotSource: persistRecordSource,
                persistSnapshotStrategy: new OIMPersistMemorySnapshotStrategy<TOIMPersistVersionedShape>({ storageKey: 'users' }),
                persistCodec: persistCodecVersioned,
            });
        const persistMemoryBackend = new OIMPersistMemoryBackend();
        const sourceUsers = buildUsers(new OIMDB());
        const sourcePersistor = createPersistor(persistMemoryBackend);
        sourcePersistor.addPersistResource(createVersionedResource(sourceUsers.persistRecordSource));
        sourceUsers.entityService.slotContentService.upsertEntities(sourceUsers.entityStoreSlot,[{ ...ada }, { ...grace }]);
        await sourcePersistor.persist();

        expect(persistMemoryBackend.readSnapshotValue('users')).toEqual({
            version: 1,
            data: { records: [{ key: 'u1', entity: ada }, { key: 'u2', entity: grace }] },
        });

        const targetUsers = buildUsers(new OIMDB());
        const targetPersistor = createPersistor(persistMemoryBackend);
        targetPersistor.addPersistResource(createVersionedResource(targetUsers.persistRecordSource));
        await targetPersistor.hydrate();

        expect(entitiesOf(targetUsers.entityService, targetUsers.entityStoreSlot)).toEqual([ada, grace]);
    });

    test('autosave writes nothing before the drain, and the whole snapshot after it', async () => {
        const persistMemoryBackend = new OIMPersistMemoryBackend();
        const users = buildUsers(new OIMDB());
        const persistor = createPersistor(persistMemoryBackend);
        persistor.addPersistResource(createUsersSnapshotResource(users.persistRecordSource, 'users'));
        startAutosave(persistor);

        users.entityService.slotContentService.upsertEntity(users.entityStoreSlot,{ ...ada });
        users.entityService.slotContentService.upsertEntity(users.entityStoreSlot,{ ...grace });
        expect(persistMemoryBackend.readSnapshotValue('users')).toBeUndefined();

        await settleAutosave(persistor);

        expect(persistMemoryBackend.readSnapshotValue('users')).toEqual({
            records: [{ key: 'u1', entity: ada }, { key: 'u2', entity: grace }],
        });
    });

    test('clearPersisted removes the snapshot it wrote', async () => {
        const persistMemoryBackend = new OIMPersistMemoryBackend();
        const users = buildUsers(new OIMDB());
        const persistor = createPersistor(persistMemoryBackend);
        persistor.addPersistResource(createUsersSnapshotResource(users.persistRecordSource, 'users'));
        users.entityService.slotContentService.upsertEntity(users.entityStoreSlot,{ ...ada });
        await persistor.persist();
        expect(persistMemoryBackend.readSnapshotValue('users')).toBeDefined();

        await persistor.clearPersisted();

        expect(persistMemoryBackend.readSnapshotValue('users')).toBeUndefined();
    });

    test('a single entity and a keyed bucket both round-trip', async () => {
        const persistMemoryBackend = new OIMPersistMemoryBackend();
        const buildAdmins = (db: OIMDB) => {
            const entityService = createOIMEntityService<TUser>(db, { keyOf: user => user.id });
            const entityStoreSlot = entityService.createStoreSlot(db);
            const bucketService = createOIMBucketService<TOIMEntitySlot<TUser, TOIMStoreKey>>(db);
            const bucketStoreSlot = bucketService.createStoreSlot(db);
            const bucketSlot = bucketService.holdSlotByKey(bucketStoreSlot, 'admin');
            const persistRecordSource = new OIMPersistRecordSourceBucketDriven({
                channelMap: db,
                entityCollectionService: entityService,
                entityStoreSlot,
                slotContentBucketService: bucketService.slotContentService,
                bucketSlot,
            });
            const persistResourceSnapshot = new OIMPersistResourceSnapshot<
                OIMPersistMemoryBackend, OIMPersistMemoryWriteBatch, TUserRecords, TUserRecords
            >({
                persistSnapshotSource: persistRecordSource,
                persistSnapshotStrategy: new OIMPersistMemorySnapshotStrategy<TUserRecords>({ storageKey: 'admins' }),
                persistCodec: new OIMPersistCodecIdentity<TUserRecords>(),
            });
            return { entityService, entityStoreSlot, bucketService, bucketSlot, persistResourceSnapshot };
        };
        const createSettingsResource = (persistSnapshotSource: ReturnType<typeof buildSettings>['persistSnapshotSource']) =>
            new OIMPersistResourceSnapshot<OIMPersistMemoryBackend, OIMPersistMemoryWriteBatch, TSettings, TSettings>({
                persistSnapshotSource,
                persistSnapshotStrategy: new OIMPersistMemorySnapshotStrategy<TSettings>({ storageKey: 'settings' }),
                persistCodec: new OIMPersistCodecIdentity<TSettings>(),
            });

        const sourceDb = new OIMDB();
        const sourceSettings = buildSettings(sourceDb, { theme: 'dark' });
        const sourceAdmins = buildAdmins(sourceDb);
        const [adaSlot] = sourceAdmins.entityService.slotContentService.upsertEntities(sourceAdmins.entityStoreSlot, [{ ...ada }, { ...grace }]);
        sourceAdmins.bucketService.slotContentService.writeBucketMemberSlots(sourceAdmins.bucketSlot, [adaSlot]);
        sourceDb.flush();
        const sourcePersistor = createPersistor(persistMemoryBackend);
        sourcePersistor.addPersistResource(createSettingsResource(sourceSettings.persistSnapshotSource));
        sourcePersistor.addPersistResource(sourceAdmins.persistResourceSnapshot);
        await sourcePersistor.persist();

        const targetDb = new OIMDB();
        const targetSettings = buildSettings(targetDb, { theme: '' });
        const targetAdmins = buildAdmins(targetDb);
        const targetPersistor = createPersistor(persistMemoryBackend);
        targetPersistor.addPersistResource(createSettingsResource(targetSettings.persistSnapshotSource));
        targetPersistor.addPersistResource(targetAdmins.persistResourceSnapshot);
        await targetPersistor.hydrate();
        targetDb.flush();

        expect(targetSettings.singleEntityService.slotContentService.findEntityByKey(targetSettings.singleEntityStoreSlot, undefined)).toEqual({ theme: 'dark' });
        expect(Array.from(
            targetAdmins.bucketService.slotContentService.getBucketMemberSlots(targetAdmins.bucketSlot),
            entitySlot => entitySlot.entity,
        )).toEqual([ada]);
    });

    test('a removed resource is written neither by autosave nor by persist', async () => {
        const persistMemoryBackend = new OIMPersistMemoryBackend();
        const users = buildUsers(new OIMDB());
        const persistor = createPersistor(persistMemoryBackend);
        const persistResourceSnapshot = persistor.addPersistResource(
            createUsersSnapshotResource(users.persistRecordSource, 'users'),
        );
        startAutosave(persistor);
        persistor.removePersistResource(persistResourceSnapshot);

        users.entityService.slotContentService.upsertEntity(users.entityStoreSlot,{ ...ada });
        await settleAutosave(persistor);
        await persistor.persist();

        expect(persistMemoryBackend.readSnapshotValue('users')).toBeUndefined();
    });

    test('each records resource writes under the storageKey it was given, and nothing else', async () => {
        const persistMemoryBackend = new OIMPersistMemoryBackend();
        const db = new OIMDB();
        const users = buildUsers(db);
        const admins = buildUsers(db);
        const persistor = createPersistor(persistMemoryBackend);
        persistor.addPersistResource(createUsersRecordsResource(users.persistRecordSource, 'users'));
        persistor.addPersistResource(createUsersRecordsResource(admins.persistRecordSource, 'admins'));

        users.entityService.slotContentService.upsertEntity(users.entityStoreSlot,{ ...ada });
        admins.entityService.slotContentService.upsertEntity(admins.entityStoreSlot,{ ...grace });
        await persistor.persist();

        expect(entityByKeyOf(persistMemoryBackend, 'users')).toEqual(new Map([['u1', ada]]));
        expect(entityByKeyOf(persistMemoryBackend, 'admins')).toEqual(new Map([['u2', grace]]));
        expect(persistMemoryBackend.readSnapshotValue('users')).toBeUndefined();
        expect(persistMemoryBackend.readSnapshotValue('admins')).toBeUndefined();
    });

    test('a records resource persists and a fresh collection hydrates from it', async () => {
        const persistMemoryBackend = new OIMPersistMemoryBackend();
        const sourceUsers = buildUsers(new OIMDB());
        const sourcePersistor = createPersistor(persistMemoryBackend);
        sourcePersistor.addPersistResource(createUsersRecordsResource(sourceUsers.persistRecordSource, 'users'));
        sourceUsers.entityService.slotContentService.upsertEntities(sourceUsers.entityStoreSlot,[{ ...ada }, { ...grace }]);
        await sourcePersistor.persist();

        const targetUsers = buildUsers(new OIMDB());
        const targetPersistor = createPersistor(persistMemoryBackend);
        targetPersistor.addPersistResource(createUsersRecordsResource(targetUsers.persistRecordSource, 'users'));
        await targetPersistor.hydrate();

        expect(entitiesOf(targetUsers.entityService, targetUsers.entityStoreSlot)).toEqual([ada, grace]);
    });

    test('records autosave writes only the changed entity, leaving the rest of the table untouched', async () => {
        const persistMemoryBackend = new OIMPersistMemoryBackend();
        const users = buildUsers(new OIMDB());
        const persistor = createPersistor(persistMemoryBackend);
        persistor.addPersistResource(createUsersRecordsResource(users.persistRecordSource, 'users'));
        startAutosave(persistor);
        users.entityService.slotContentService.upsertEntities(users.entityStoreSlot,[{ ...ada }, { ...grace }]);
        await settleAutosave(persistor);
        expect(entityByKeyOf(persistMemoryBackend, 'users')?.get('u1')).toEqual(ada);

        persistMemoryBackend.writeRecordsDelta('users', {
            upserts: [{ key: '__marker__', entity: { id: '__marker__', name: 'x' } }],
            deletedKeys: [],
        });
        users.entityService.slotContentService.upsertEntity(users.entityStoreSlot,{ id: 'u2', name: 'Grace Hopper' });
        await settleAutosave(persistor);

        const entityByKey = entityByKeyOf(persistMemoryBackend, 'users');
        expect(entityByKey?.get('__marker__')).toEqual({ id: '__marker__', name: 'x' });
        expect(entityByKey?.get('u2')).toEqual({ id: 'u2', name: 'Grace Hopper' });
        expect(entityByKey?.get('u1')).toEqual(ada);
    });

    test('records autosave deletes a deleted entity from the table', async () => {
        const persistMemoryBackend = new OIMPersistMemoryBackend();
        const users = buildUsers(new OIMDB());
        const persistor = createPersistor(persistMemoryBackend);
        persistor.addPersistResource(createUsersRecordsResource(users.persistRecordSource, 'users'));
        startAutosave(persistor);
        users.entityService.slotContentService.upsertEntities(users.entityStoreSlot,[{ ...ada }, { ...grace }]);
        await settleAutosave(persistor);

        users.entityService.slotContentService.deleteEntity(users.entityService.getSlotByKey(users.entityStoreSlot, 'u1'));
        await settleAutosave(persistor);

        const entityByKey = entityByKeyOf(persistMemoryBackend, 'users');
        expect(entityByKey?.has('u1')).toBe(false);
        expect(entityByKey?.get('u2')).toEqual(grace);
    });

    test('a key deleted and written again before the drain is stored, not deleted', async () => {
        const persistMemoryBackend = new OIMPersistMemoryBackend();
        const users = buildUsers(new OIMDB());
        const persistor = createPersistor(persistMemoryBackend);
        persistor.addPersistResource(createUsersRecordsResource(users.persistRecordSource, 'users'));
        startAutosave(persistor);
        users.entityService.slotContentService.upsertEntity(users.entityStoreSlot,{ ...ada });
        await settleAutosave(persistor);

        users.entityService.slotContentService.deleteEntity(users.entityService.getSlotByKey(users.entityStoreSlot, 'u1'));
        users.entityService.slotContentService.upsertEntity(users.entityStoreSlot,{ id: 'u1', name: 'Ada Lovelace' });
        await settleAutosave(persistor);

        expect(entityByKeyOf(persistMemoryBackend, 'users')).toEqual(new Map([['u1', { id: 'u1', name: 'Ada Lovelace' }]]));
    });

    test('a custom snapshot strategy can write to a storage shape of its own', async () => {
        const persistMemoryBackend = new OIMPersistMemoryBackend();
        const customSnapshotStrategy: IOIMPersistSnapshotStrategy<OIMPersistMemoryBackend, OIMPersistMemoryWriteBatch, TUserRecords> = {
            readSnapshot: async persistBackend => persistBackend.readSnapshotValue('entities:users') as TUserRecords | undefined,
            writeSnapshot: (persistMemoryWriteBatch, snapshot) => {
                persistMemoryWriteBatch.writeSnapshotValue('entities:users', snapshot);
            },
            deleteSnapshot: persistMemoryWriteBatch => {
                persistMemoryWriteBatch.deleteSnapshotValue('entities:users');
            },
        };
        const users = buildUsers(new OIMDB());
        const persistor = createPersistor(persistMemoryBackend);
        persistor.addPersistResource(new OIMPersistResourceSnapshot<
            OIMPersistMemoryBackend, OIMPersistMemoryWriteBatch, TUserRecords, TUserRecords
        >({
            persistSnapshotSource: users.persistRecordSource,
            persistSnapshotStrategy: customSnapshotStrategy,
            persistCodec: new OIMPersistCodecIdentity<TUserRecords>(),
        }));

        users.entityService.slotContentService.upsertEntity(users.entityStoreSlot,{ ...ada });
        await persistor.persist();

        expect(persistMemoryBackend.readSnapshotValue('entities:users')).toEqual({ records: [{ key: 'u1', entity: ada }] });
    });

    test('readRecordsOfKeys returns only the keys it found, in the order they were asked for', async () => {
        const persistMemoryBackend = new OIMPersistMemoryBackend();
        persistMemoryBackend.writeRecordsDelta('users', {
            upserts: [
                { key: 'u1', entity: ada },
                { key: 'u2', entity: grace },
                { key: 'u3', entity: { id: 'u3', name: 'Edsger' } },
            ],
            deletedKeys: [],
        });

        expect(persistMemoryBackend.readRecordsOfKeys('users', ['u3', 'u9', 'u1'])).toEqual({
            records: [{ key: 'u3', entity: { id: 'u3', name: 'Edsger' } }, { key: 'u1', entity: ada }],
        });
        expect(persistMemoryBackend.readRecordsOfKeys('admins', ['u1'])).toEqual({ records: [] });
        expect(await new OIMPersistMemoryRecordsStrategy<TOIMStoreKey, TUser>({ storageKey: 'users' })
            .readRecordsOfKeys(persistMemoryBackend, ['u2', 'u9'])).toEqual({ records: [{ key: 'u2', entity: grace }] });
    });

    test('clearPersisted removes the whole table of a records resource', async () => {
        const persistMemoryBackend = new OIMPersistMemoryBackend();
        const users = buildUsers(new OIMDB());
        const persistor = createPersistor(persistMemoryBackend);
        persistor.addPersistResource(createUsersRecordsResource(users.persistRecordSource, 'users'));
        users.entityService.slotContentService.upsertEntity(users.entityStoreSlot,{ ...ada });
        await persistor.persist();
        expect(persistMemoryBackend.readRecords('users')).toBeDefined();

        await persistor.clearPersisted();

        expect(persistMemoryBackend.readRecords('users')).toBeUndefined();
    });
});

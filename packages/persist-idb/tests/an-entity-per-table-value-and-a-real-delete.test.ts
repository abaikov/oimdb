import { IDBFactory } from 'fake-indexeddb';
import type { TOIMEntitySlot, TOIMStoreKey, TOIMStoreSlot } from '@oimdb/core';
import {
    OIMDB,
    createOIMEntityService,
    createOIMEntityWriterInPlace,
    createOIMSingleEntityService,
} from '@oimdb/core';
import type { TOIMPersistRecords, TOIMPersistVersionedShape } from '@oimdb/persist';
import {
    OIMPersistCodecIdentity,
    OIMPersistCodecVersioned,
    OIMPersistEntityWriter,
    OIMPersistRecordSourceCollectionChangeDriven,
    OIMPersistResourceRecords,
    OIMPersistResourceSnapshot,
    OIMPersistSchedulerFrameDriven,
    OIMPersistSchedulerMicrotaskDriven,
    OIMPersistSnapshotSourceSingleEntityDriven,
    OIMPersistor,
} from '@oimdb/persist';
import type { OIMPersistIndexedDbWriteBatch } from '../src';
import { OIMPersistIndexedDbBackend, OIMPersistIndexedDbRecordsStrategy, OIMPersistIndexedDbSnapshotStrategy } from '../src';

type TUser = { id: string; name: string };
type TSettings = { theme: string };
type TUserRecords = TOIMPersistRecords<TOIMStoreKey, TUser>;
type TIndexedDbPersistor = OIMPersistor<OIMPersistIndexedDbBackend, OIMPersistIndexedDbWriteBatch>;

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
    const createRecordsResource = () =>
        new OIMPersistResourceRecords<OIMPersistIndexedDbBackend, OIMPersistIndexedDbWriteBatch, TOIMStoreKey, TUser>({
            persistRecordSource,
            persistRecordsStrategy: new OIMPersistIndexedDbRecordsStrategy<TOIMStoreKey, TUser>({ tableName: 'users' }),
        });
    const createSnapshotResource = () =>
        new OIMPersistResourceSnapshot<OIMPersistIndexedDbBackend, OIMPersistIndexedDbWriteBatch, TUserRecords, TUserRecords>({
            persistSnapshotSource: persistRecordSource,
            persistSnapshotStrategy: new OIMPersistIndexedDbSnapshotStrategy<TUserRecords>({ tableName: 'entries', primaryKey: 'users' }),
            persistCodec: new OIMPersistCodecIdentity<TUserRecords>(),
        });
    return { entityService, entityStoreSlot, persistRecordSource, createRecordsResource, createSnapshotResource };
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

async function entityByKeyOf(persistIndexedDbBackend: OIMPersistIndexedDbBackend): Promise<Map<unknown, unknown>> {
    const persistIndexedDbTableRecords = (await persistIndexedDbBackend.readAllTableRecords('users')) ?? [];
    return new Map(persistIndexedDbTableRecords.map(persistIndexedDbTableRecord => [persistIndexedDbTableRecord.key, persistIndexedDbTableRecord.value]));
}

describe('@oimdb/persist-idb', () => {
    const startedPersistors: TIndexedDbPersistor[] = [];
    afterEach(() => {
        for (const persistor of startedPersistors.splice(0)) persistor.destroy();
    });

    function createPersistor(persistIndexedDbBackend: OIMPersistIndexedDbBackend): TIndexedDbPersistor {
        return new OIMPersistor<OIMPersistIndexedDbBackend, OIMPersistIndexedDbWriteBatch>({
            persistBackend: persistIndexedDbBackend,
            persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
        });
    }

    function startAutosave(persistor: TIndexedDbPersistor): void {
        startedPersistors.push(persistor);
        persistor.start();
    }

    async function settleAutosave(persistor: TIndexedDbPersistor): Promise<void> {
        await Promise.resolve();
        await persistor.whenIdle();
    }

    describe('the records strategy', () => {
        test('stores one table value per entity, and a fresh collection hydrates from them', async () => {
            const persistIndexedDbBackend = new OIMPersistIndexedDbBackend({
                databaseName: 'records-roundtrip-db',
                indexedDb: new IDBFactory(),
            });
            const sourceUsers = buildUsers(new OIMDB());
            const sourcePersistor = createPersistor(persistIndexedDbBackend);
            sourcePersistor.addPersistResource(sourceUsers.createRecordsResource());
            sourceUsers.entityService.slotContentService.upsertEntities(sourceUsers.entityStoreSlot,[{ ...ada }, { ...grace }]);
            await sourcePersistor.persist();

            expect(await persistIndexedDbBackend.readAllTableRecords('users')).toEqual([
                { key: 'u1', value: ada },
                { key: 'u2', value: grace },
            ]);

            const targetUsers = buildUsers(new OIMDB());
            const targetPersistor = createPersistor(persistIndexedDbBackend);
            targetPersistor.addPersistResource(targetUsers.createRecordsResource());
            await targetPersistor.hydrate();

            expect(entitiesOf(targetUsers.entityService, targetUsers.entityStoreSlot)).toEqual([ada, grace]);
        });

        test('a deletion is reflected after a second persist and a fresh hydrate', async () => {
            const persistIndexedDbBackend = new OIMPersistIndexedDbBackend({ databaseName: 'removal-db', indexedDb: new IDBFactory() });
            const sourceUsers = buildUsers(new OIMDB());
            const sourcePersistor = createPersistor(persistIndexedDbBackend);
            sourcePersistor.addPersistResource(sourceUsers.createRecordsResource());
            sourceUsers.entityService.slotContentService.upsertEntities(sourceUsers.entityStoreSlot,[{ ...ada }, { ...grace }]);
            await sourcePersistor.persist();

            sourceUsers.entityService.slotContentService.deleteEntity(sourceUsers.entityService.getSlotByKey(sourceUsers.entityStoreSlot, 'u1'));
            await sourcePersistor.persist();

            const targetUsers = buildUsers(new OIMDB());
            const targetPersistor = createPersistor(persistIndexedDbBackend);
            targetPersistor.addPersistResource(targetUsers.createRecordsResource());
            await targetPersistor.hydrate();

            expect(entitiesOf(targetUsers.entityService, targetUsers.entityStoreSlot)).toEqual([grace]);
        });

        test('autosave writes only the changed entity, leaving the rest of the table untouched', async () => {
            const persistIndexedDbBackend = new OIMPersistIndexedDbBackend({
                databaseName: 'records-delta-db',
                indexedDb: new IDBFactory(),
            });
            const users = buildUsers(new OIMDB());
            const persistor = createPersistor(persistIndexedDbBackend);
            persistor.addPersistResource(users.createRecordsResource());
            startAutosave(persistor);
            users.entityService.slotContentService.upsertEntities(users.entityStoreSlot,[{ ...ada }, { ...grace }]);
            await settleAutosave(persistor);
            expect((await entityByKeyOf(persistIndexedDbBackend)).size).toBe(2);

            const persistIndexedDbWriteBatch = persistIndexedDbBackend.createWriteBatch();
            persistIndexedDbWriteBatch.putTableValue('users', '__marker__', { id: '__marker__', name: 'x' });
            await persistIndexedDbWriteBatch.commit();

            users.entityService.slotContentService.upsertEntity(users.entityStoreSlot,{ id: 'u2', name: 'Grace Hopper' });
            await settleAutosave(persistor);

            const entityByKey = await entityByKeyOf(persistIndexedDbBackend);
            expect(entityByKey.get('__marker__')).toEqual({ id: '__marker__', name: 'x' });
            expect(entityByKey.get('u2')).toEqual({ id: 'u2', name: 'Grace Hopper' });
            expect(entityByKey.get('u1')).toEqual(ada);
        });

        test('autosave deletes a deleted entity from the table', async () => {
            const persistIndexedDbBackend = new OIMPersistIndexedDbBackend({
                databaseName: 'records-delete-db',
                indexedDb: new IDBFactory(),
            });
            const users = buildUsers(new OIMDB());
            const persistor = createPersistor(persistIndexedDbBackend);
            persistor.addPersistResource(users.createRecordsResource());
            startAutosave(persistor);
            users.entityService.slotContentService.upsertEntities(users.entityStoreSlot,[{ ...ada }, { ...grace }]);
            await settleAutosave(persistor);

            users.entityService.slotContentService.deleteEntity(users.entityService.getSlotByKey(users.entityStoreSlot, 'u1'));
            await settleAutosave(persistor);

            expect(await persistIndexedDbBackend.readAllTableRecords('users')).toEqual([{ key: 'u2', value: grace }]);
        });

        test('clearPersisted empties the table, so a fresh collection hydrates nothing', async () => {
            const persistIndexedDbBackend = new OIMPersistIndexedDbBackend({ databaseName: 'clear-db', indexedDb: new IDBFactory() });
            const sourceUsers = buildUsers(new OIMDB());
            const sourcePersistor = createPersistor(persistIndexedDbBackend);
            sourcePersistor.addPersistResource(sourceUsers.createRecordsResource());
            sourceUsers.entityService.slotContentService.upsertEntities(sourceUsers.entityStoreSlot,[{ ...ada }, { ...grace }]);
            await sourcePersistor.persist();

            await sourcePersistor.clearPersisted();

            const targetUsers = buildUsers(new OIMDB());
            const targetPersistor = createPersistor(persistIndexedDbBackend);
            targetPersistor.addPersistResource(targetUsers.createRecordsResource());
            await targetPersistor.hydrate();

            expect(await persistIndexedDbBackend.readAllTableRecords('users')).toEqual([]);
            expect(entitiesOf(targetUsers.entityService, targetUsers.entityStoreSlot)).toEqual([]);
        });

        test('a deleted table value is gone from the table, not stored as undefined', async () => {
            const persistIndexedDbBackend = new OIMPersistIndexedDbBackend({ databaseName: 'delete-db', indexedDb: new IDBFactory() });
            const putWriteBatch = persistIndexedDbBackend.createWriteBatch();
            putWriteBatch.putTableValue('users', 'u1', { ...ada });
            await putWriteBatch.commit();
            expect(await persistIndexedDbBackend.readAllTableRecords('users')).toHaveLength(1);

            const deleteWriteBatch = persistIndexedDbBackend.createWriteBatch();
            deleteWriteBatch.deleteTableValue('users', 'u1');
            await deleteWriteBatch.commit();

            expect(await persistIndexedDbBackend.readAllTableRecords('users')).toHaveLength(0);
        });
    });

    describe('the snapshot strategy', () => {
        test('a snapshot one persistor wrote, a fresh persistor hydrates', async () => {
            const persistIndexedDbBackend = new OIMPersistIndexedDbBackend({
                databaseName: 'snapshot-roundtrip-db',
                indexedDb: new IDBFactory(),
            });
            const sourceUsers = buildUsers(new OIMDB());
            const sourcePersistor = createPersistor(persistIndexedDbBackend);
            sourcePersistor.addPersistResource(sourceUsers.createSnapshotResource());
            sourceUsers.entityService.slotContentService.upsertEntities(sourceUsers.entityStoreSlot,[{ ...ada }, { ...grace }]);
            await sourcePersistor.persist();

            expect(await persistIndexedDbBackend.readTableValue('entries', 'users')).toEqual({
                records: [{ key: 'u1', entity: ada }, { key: 'u2', entity: grace }],
            });

            const targetUsers = buildUsers(new OIMDB());
            const targetPersistor = createPersistor(persistIndexedDbBackend);
            targetPersistor.addPersistResource(targetUsers.createSnapshotResource());
            await targetPersistor.hydrate();

            expect(entitiesOf(targetUsers.entityService, targetUsers.entityStoreSlot)).toEqual([ada, grace]);
        });

        test('a versioned codec envelope is what the table holds, and it decodes on hydrate', async () => {
            const persistCodecVersioned = new OIMPersistCodecVersioned<TUserRecords, TUserRecords>({
                version: 1,
                migrations: {},
                persistCodec: new OIMPersistCodecIdentity<TUserRecords>(),
            });
            const createVersionedResource = (users: ReturnType<typeof buildUsers>) => new OIMPersistResourceSnapshot<
                OIMPersistIndexedDbBackend, OIMPersistIndexedDbWriteBatch, TUserRecords, TOIMPersistVersionedShape
            >({
                persistSnapshotSource: users.persistRecordSource,
                persistSnapshotStrategy: new OIMPersistIndexedDbSnapshotStrategy<TOIMPersistVersionedShape>({
                    tableName: 'entries',
                    primaryKey: 'users',
                }),
                persistCodec: persistCodecVersioned,
            });
            const persistIndexedDbBackend = new OIMPersistIndexedDbBackend({ databaseName: 'codec-db', indexedDb: new IDBFactory() });
            const sourceUsers = buildUsers(new OIMDB());
            const sourcePersistor = createPersistor(persistIndexedDbBackend);
            sourcePersistor.addPersistResource(createVersionedResource(sourceUsers));
            sourceUsers.entityService.slotContentService.upsertEntities(sourceUsers.entityStoreSlot,[{ ...ada }, { ...grace }]);
            await sourcePersistor.persist();

            expect(await persistIndexedDbBackend.readTableValue('entries', 'users')).toEqual({
                version: 1,
                data: { records: [{ key: 'u1', entity: ada }, { key: 'u2', entity: grace }] },
            });

            const targetUsers = buildUsers(new OIMDB());
            const targetPersistor = createPersistor(persistIndexedDbBackend);
            targetPersistor.addPersistResource(createVersionedResource(targetUsers));
            await targetPersistor.hydrate();

            expect(entitiesOf(targetUsers.entityService, targetUsers.entityStoreSlot)).toEqual([ada, grace]);
        });

        test('frame-driven autosave writes nothing before the flush, and the snapshot after it', async () => {
            const persistIndexedDbBackend = new OIMPersistIndexedDbBackend({
                databaseName: 'snapshot-autosave-db',
                indexedDb: new IDBFactory(),
            });
            const db = new OIMDB();
            const users = buildUsers(db);
            const persistor = new OIMPersistor<OIMPersistIndexedDbBackend, OIMPersistIndexedDbWriteBatch>({
                persistBackend: persistIndexedDbBackend,
                persistScheduler: new OIMPersistSchedulerFrameDriven({ channelSlot: db.defaultChannelSlot }),
            });
            persistor.addPersistResource(users.createSnapshotResource());
            startAutosave(persistor);

            users.entityService.slotContentService.upsertEntity(users.entityStoreSlot,{ ...ada });
            users.entityService.slotContentService.upsertEntity(users.entityStoreSlot,{ ...grace });
            expect(await persistIndexedDbBackend.readTableValue('entries', 'users')).toBeUndefined();

            db.flush();
            await persistor.whenIdle();

            expect(await persistIndexedDbBackend.readTableValue('entries', 'users')).toEqual({
                records: [{ key: 'u1', entity: ada }, { key: 'u2', entity: grace }],
            });
        });

        test('clearPersisted deletes the table value it wrote', async () => {
            const persistIndexedDbBackend = new OIMPersistIndexedDbBackend({
                databaseName: 'snapshot-clear-db',
                indexedDb: new IDBFactory(),
            });
            const users = buildUsers(new OIMDB());
            const persistor = createPersistor(persistIndexedDbBackend);
            persistor.addPersistResource(users.createSnapshotResource());
            users.entityService.slotContentService.upsertEntity(users.entityStoreSlot,{ ...ada });
            await persistor.persist();
            expect(await persistIndexedDbBackend.readTableValue('entries', 'users')).toBeDefined();

            await persistor.clearPersisted();

            expect(await persistIndexedDbBackend.readTableValue('entries', 'users')).toBeUndefined();
        });

        test('a single entity round-trips', async () => {
            const buildSettings = (db: OIMDB, settings: TSettings) => {
                const singleEntityService = createOIMSingleEntityService<TSettings>(db);
                const singleEntityStoreSlot = singleEntityService.createStoreSlot(db);
                singleEntityService.slotContentService.upsertEntity(singleEntityStoreSlot, settings);
                db.flush();
                const persistResourceSnapshot = new OIMPersistResourceSnapshot<
                    OIMPersistIndexedDbBackend, OIMPersistIndexedDbWriteBatch, TSettings, TSettings
                >({
                    persistSnapshotSource: new OIMPersistSnapshotSourceSingleEntityDriven<TSettings>({
                        channelMap: db, singleSlotService: singleEntityService, entityStoreSlot: singleEntityStoreSlot,
                    }),
                    persistSnapshotStrategy: new OIMPersistIndexedDbSnapshotStrategy<TSettings>({ tableName: 'entries', primaryKey: 'settings' }),
                    persistCodec: new OIMPersistCodecIdentity<TSettings>(),
                });
                return { singleEntityService, singleEntityStoreSlot, persistResourceSnapshot };
            };
            const persistIndexedDbBackend = new OIMPersistIndexedDbBackend({
                databaseName: 'single-entity-db',
                indexedDb: new IDBFactory(),
            });
            const sourceSettings = buildSettings(new OIMDB(), { theme: 'dark' });
            const sourcePersistor = createPersistor(persistIndexedDbBackend);
            sourcePersistor.addPersistResource(sourceSettings.persistResourceSnapshot);
            await sourcePersistor.persist();

            const targetSettings = buildSettings(new OIMDB(), { theme: '' });
            const targetPersistor = createPersistor(persistIndexedDbBackend);
            targetPersistor.addPersistResource(targetSettings.persistResourceSnapshot);
            await targetPersistor.hydrate();

            expect(targetSettings.singleEntityService.slotContentService.findEntityByKey(targetSettings.singleEntityStoreSlot, undefined)).toEqual({ theme: 'dark' });
        });

        test('a removed resource is written neither by autosave nor by persist', async () => {
            const persistIndexedDbBackend = new OIMPersistIndexedDbBackend({
                databaseName: 'snapshot-removed-db',
                indexedDb: new IDBFactory(),
            });
            const users = buildUsers(new OIMDB());
            const persistor = createPersistor(persistIndexedDbBackend);
            const persistResourceSnapshot = persistor.addPersistResource(users.createSnapshotResource());
            startAutosave(persistor);
            persistor.removePersistResource(persistResourceSnapshot);

            users.entityService.slotContentService.upsertEntity(users.entityStoreSlot,{ ...ada });
            await settleAutosave(persistor);
            await persistor.persist();

            expect(await persistIndexedDbBackend.readTableValue('entries', 'users')).toBeUndefined();
        });
    });
});

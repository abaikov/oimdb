import type { TOIMEntitySlot, TOIMStoreKey, TOIMStoreSlot } from '@oimdb/core';
import {
    OIMDB,
    createOIMEntityService,
    createOIMEntityWriterInPlace,
    createOIMSingleEntityService,
} from '@oimdb/core';
import type {
    IOIMPersistSnapshotStrategy,
    OIMPersistKeyValueBackend,
    OIMPersistKeyValueWriteBatch,
    TOIMPersistKeyValueItemStorage,
    TOIMPersistRecords,
    TOIMPersistVersionedShape,
} from '@oimdb/persist';
import {
    OIMPersistCodecIdentity,
    OIMPersistCodecVersioned,
    OIMPersistEntityWriter,
    OIMPersistKeyValueEntryStrategy,
    OIMPersistKeyValuePathStrategy,
    OIMPersistRecordSourceCollectionChangeDriven,
    OIMPersistResourceSnapshot,
    OIMPersistSchedulerMicrotaskDriven,
    OIMPersistSnapshotSourceSingleEntityDriven,
    OIMPersistor,
} from '@oimdb/persist';
import { OIMPersistLocalStorageBackend } from '../src';

type TUser = { id: string; name: string };
type TSettings = { theme: string };
type TUserRecords = TOIMPersistRecords<TOIMStoreKey, TUser>;
type TLocalStoragePersistor = OIMPersistor<OIMPersistKeyValueBackend, OIMPersistKeyValueWriteBatch>;
type TKeyValueSnapshotStrategy<TSnapshot> = IOIMPersistSnapshotStrategy<
    OIMPersistKeyValueBackend, OIMPersistKeyValueWriteBatch, TSnapshot
>;

const ada: TUser = { id: 'u1', name: 'Ada' };
const grace: TUser = { id: 'u2', name: 'Grace' };

function createPersistKeyValueItemStorage(): TOIMPersistKeyValueItemStorage {
    const itemByStorageKey = new Map<string, string>();
    return {
        getItem: storageKey => itemByStorageKey.get(storageKey) ?? null,
        setItem: (storageKey, item) => {
            itemByStorageKey.set(storageKey, item);
        },
        removeItem: storageKey => {
            itemByStorageKey.delete(storageKey);
        },
    };
}

function parsedItemOf(persistKeyValueItemStorage: TOIMPersistKeyValueItemStorage, storageKey: string): unknown {
    const item = persistKeyValueItemStorage.getItem(storageKey) as string | null;
    return item === null ? undefined : JSON.parse(item);
}

function createPersistor(
    persistKeyValueItemStorage: TOIMPersistKeyValueItemStorage,
    onPersistError?: (error: unknown) => void,
): TLocalStoragePersistor {
    return new OIMPersistor<OIMPersistKeyValueBackend, OIMPersistKeyValueWriteBatch>({
        persistBackend: new OIMPersistLocalStorageBackend({ persistKeyValueItemStorage }),
        persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
        onPersistError,
    });
}

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
    const createPersistResource = (persistSnapshotStrategy: TKeyValueSnapshotStrategy<TUserRecords>) =>
        new OIMPersistResourceSnapshot<OIMPersistKeyValueBackend, OIMPersistKeyValueWriteBatch, TUserRecords, TUserRecords>({
            persistSnapshotSource: persistRecordSource,
            persistSnapshotStrategy,
            persistCodec: new OIMPersistCodecIdentity<TUserRecords>(),
        });
    return { entityService, entityStoreSlot, persistRecordSource, createPersistResource };
}

function buildSettings(db: OIMDB, settings: TSettings) {
    const singleEntityService = createOIMSingleEntityService<TSettings>(db);
    const singleEntityStoreSlot = singleEntityService.createStoreSlot(db);
    singleEntityService.slotContentService.upsertEntity(singleEntityStoreSlot, settings);
    db.flush();
    const persistSnapshotSource = new OIMPersistSnapshotSourceSingleEntityDriven<TSettings>({
        channelMap: db, singleSlotService: singleEntityService, entityStoreSlot: singleEntityStoreSlot,
    });
    const createPersistResource = (persistSnapshotStrategy: TKeyValueSnapshotStrategy<TSettings>) =>
        new OIMPersistResourceSnapshot<OIMPersistKeyValueBackend, OIMPersistKeyValueWriteBatch, TSettings, TSettings>({
            persistSnapshotSource,
            persistSnapshotStrategy,
            persistCodec: new OIMPersistCodecIdentity<TSettings>(),
        });
    return { singleEntityService, singleEntityStoreSlot, createPersistResource };
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

describe('@oimdb/persist-localstorage', () => {
    test('a snapshot is handed to web storage as JSON text, not as the live object', async () => {
        const persistKeyValueItemStorage = createPersistKeyValueItemStorage();
        const users = buildUsers(new OIMDB());
        const persistor = createPersistor(persistKeyValueItemStorage);
        persistor.addPersistResource(users.createPersistResource(
            new OIMPersistKeyValueEntryStrategy<TUserRecords>({ storageKey: 'app:users' }),
        ));
        users.entityService.slotContentService.upsertEntity(users.entityStoreSlot,{ ...ada });
        await persistor.persist();

        const item = persistKeyValueItemStorage.getItem('app:users');
        expect(typeof item).toBe('string');
        expect(item).toBe('{"records":[{"key":"u1","entity":{"id":"u1","name":"Ada"}}]}');
    });

    test('an entry one persistor wrote, a fresh persistor over the same web storage hydrates', async () => {
        const persistKeyValueItemStorage = createPersistKeyValueItemStorage();
        const sourceUsers = buildUsers(new OIMDB());
        const sourcePersistor = createPersistor(persistKeyValueItemStorage);
        sourcePersistor.addPersistResource(sourceUsers.createPersistResource(
            new OIMPersistKeyValueEntryStrategy<TUserRecords>({ storageKey: 'app:users' }),
        ));
        sourceUsers.entityService.slotContentService.upsertEntities(sourceUsers.entityStoreSlot,[{ ...ada }, { ...grace }]);
        await sourcePersistor.persist();

        const targetUsers = buildUsers(new OIMDB());
        const targetPersistor = createPersistor(persistKeyValueItemStorage);
        targetPersistor.addPersistResource(targetUsers.createPersistResource(
            new OIMPersistKeyValueEntryStrategy<TUserRecords>({ storageKey: 'app:users' }),
        ));
        await targetPersistor.hydrate();

        expect(entitiesOf(targetUsers.entityService, targetUsers.entityStoreSlot)).toEqual([ada, grace]);
    });

    test('a versioned codec envelope is what web storage holds, and it decodes on hydrate', async () => {
        const persistCodecVersioned = new OIMPersistCodecVersioned<TUserRecords, TUserRecords>({
            version: 1,
            migrations: {},
            persistCodec: new OIMPersistCodecIdentity<TUserRecords>(),
        });
        const createVersionedResource = (users: ReturnType<typeof buildUsers>) => new OIMPersistResourceSnapshot<
            OIMPersistKeyValueBackend, OIMPersistKeyValueWriteBatch, TUserRecords, TOIMPersistVersionedShape
        >({
            persistSnapshotSource: users.persistRecordSource,
            persistSnapshotStrategy: new OIMPersistKeyValueEntryStrategy<TOIMPersistVersionedShape>({ storageKey: 'app:users' }),
            persistCodec: persistCodecVersioned,
        });
        const persistKeyValueItemStorage = createPersistKeyValueItemStorage();
        const sourceUsers = buildUsers(new OIMDB());
        const sourcePersistor = createPersistor(persistKeyValueItemStorage);
        sourcePersistor.addPersistResource(createVersionedResource(sourceUsers));
        sourceUsers.entityService.slotContentService.upsertEntities(sourceUsers.entityStoreSlot,[{ ...ada }, { ...grace }]);
        await sourcePersistor.persist();

        expect(parsedItemOf(persistKeyValueItemStorage, 'app:users')).toEqual({
            version: 1,
            data: { records: [{ key: 'u1', entity: ada }, { key: 'u2', entity: grace }] },
        });

        const targetUsers = buildUsers(new OIMDB());
        const targetPersistor = createPersistor(persistKeyValueItemStorage);
        targetPersistor.addPersistResource(createVersionedResource(targetUsers));
        await targetPersistor.hydrate();

        expect(entitiesOf(targetUsers.entityService, targetUsers.entityStoreSlot)).toEqual([ada, grace]);
    });

    test('autosave hands web storage nothing before the drain, and the whole snapshot after it', async () => {
        const persistKeyValueItemStorage = createPersistKeyValueItemStorage();
        const users = buildUsers(new OIMDB());
        const persistor = createPersistor(persistKeyValueItemStorage);
        persistor.addPersistResource(users.createPersistResource(
            new OIMPersistKeyValueEntryStrategy<TUserRecords>({ storageKey: 'app:users' }),
        ));
        persistor.start();

        users.entityService.slotContentService.upsertEntity(users.entityStoreSlot,{ ...ada });
        users.entityService.slotContentService.upsertEntity(users.entityStoreSlot,{ ...grace });
        expect(persistKeyValueItemStorage.getItem('app:users')).toBeNull();

        await Promise.resolve();
        await persistor.whenIdle();

        expect(parsedItemOf(persistKeyValueItemStorage, 'app:users')).toEqual({
            records: [{ key: 'u1', entity: ada }, { key: 'u2', entity: grace }],
        });
        persistor.destroy();
    });

    test('clearPersisted removes the item an entry wrote', async () => {
        const persistKeyValueItemStorage = createPersistKeyValueItemStorage();
        const users = buildUsers(new OIMDB());
        const persistor = createPersistor(persistKeyValueItemStorage);
        persistor.addPersistResource(users.createPersistResource(
            new OIMPersistKeyValueEntryStrategy<TUserRecords>({ storageKey: 'app:users' }),
        ));
        users.entityService.slotContentService.upsertEntity(users.entityStoreSlot,{ ...ada });
        await persistor.persist();
        expect(persistKeyValueItemStorage.getItem('app:users')).not.toBeNull();

        await persistor.clearPersisted();

        expect(persistKeyValueItemStorage.getItem('app:users')).toBeNull();
    });

    test('a single entity round-trips through an entry', async () => {
        const persistKeyValueItemStorage = createPersistKeyValueItemStorage();
        const sourceSettings = buildSettings(new OIMDB(), { theme: 'dark' });
        const sourcePersistor = createPersistor(persistKeyValueItemStorage);
        sourcePersistor.addPersistResource(sourceSettings.createPersistResource(
            new OIMPersistKeyValueEntryStrategy<TSettings>({ storageKey: 'app:settings' }),
        ));
        await sourcePersistor.persist();

        const targetSettings = buildSettings(new OIMDB(), { theme: '' });
        const targetPersistor = createPersistor(persistKeyValueItemStorage);
        targetPersistor.addPersistResource(targetSettings.createPersistResource(
            new OIMPersistKeyValueEntryStrategy<TSettings>({ storageKey: 'app:settings' }),
        ));
        await targetPersistor.hydrate();

        expect(targetSettings.singleEntityService.slotContentService.findEntityByKey(targetSettings.singleEntityStoreSlot, undefined)).toEqual({ theme: 'dark' });
    });

    test('a removed resource is written neither by autosave nor by persist', async () => {
        const persistKeyValueItemStorage = createPersistKeyValueItemStorage();
        const users = buildUsers(new OIMDB());
        const persistor = createPersistor(persistKeyValueItemStorage);
        const persistResourceSnapshot = persistor.addPersistResource(users.createPersistResource(
            new OIMPersistKeyValueEntryStrategy<TUserRecords>({ storageKey: 'app:users' }),
        ));
        persistor.start();
        persistor.removePersistResource(persistResourceSnapshot);

        users.entityService.slotContentService.upsertEntity(users.entityStoreSlot,{ ...ada });
        await Promise.resolve();
        await persistor.whenIdle();
        await persistor.persist();

        expect(persistKeyValueItemStorage.getItem('app:users')).toBeNull();
        persistor.destroy();
    });

    describe('a path strategy', () => {
        test('lands the snapshot at a nested path, and a fresh persistor reads it back', async () => {
            const persistKeyValueItemStorage = createPersistKeyValueItemStorage();
            const sourceUsers = buildUsers(new OIMDB());
            const sourcePersistor = createPersistor(persistKeyValueItemStorage);
            sourcePersistor.addPersistResource(sourceUsers.createPersistResource(
                new OIMPersistKeyValuePathStrategy<TUserRecords>({ storageKey: 'app', path: ['collections', 'users'] }),
            ));
            sourceUsers.entityService.slotContentService.upsertEntities(sourceUsers.entityStoreSlot,[{ ...ada }, { ...grace }]);
            await sourcePersistor.persist();

            expect(parsedItemOf(persistKeyValueItemStorage, 'app')).toEqual({
                collections: { users: { records: [{ key: 'u1', entity: ada }, { key: 'u2', entity: grace }] } },
            });

            const targetUsers = buildUsers(new OIMDB());
            const targetPersistor = createPersistor(persistKeyValueItemStorage);
            targetPersistor.addPersistResource(targetUsers.createPersistResource(
                new OIMPersistKeyValuePathStrategy<TUserRecords>({ storageKey: 'app', path: ['collections', 'users'] }),
            ));
            await targetPersistor.hydrate();

            expect(entitiesOf(targetUsers.entityService, targetUsers.entityStoreSlot)).toEqual([ada, grace]);
        });

        test('merges two resources sharing one root key into one root object', async () => {
            const persistKeyValueItemStorage = createPersistKeyValueItemStorage();
            const db = new OIMDB();
            const users = buildUsers(db);
            const settings = buildSettings(db, { theme: 'dark' });
            const persistor = createPersistor(persistKeyValueItemStorage);
            persistor.addPersistResource(users.createPersistResource(
                new OIMPersistKeyValuePathStrategy<TUserRecords>({ storageKey: 'app', path: ['users'] }),
            ));
            persistor.addPersistResource(settings.createPersistResource(
                new OIMPersistKeyValuePathStrategy<TSettings>({ storageKey: 'app', path: ['settings'] }),
            ));
            users.entityService.slotContentService.upsertEntity(users.entityStoreSlot,{ ...ada });
            await persistor.persist();

            expect(parsedItemOf(persistKeyValueItemStorage, 'app')).toEqual({
                users: { records: [{ key: 'u1', entity: ada }] },
                settings: { theme: 'dark' },
            });
        });

        test('clearPersisted removes each nested path and keeps the root key', async () => {
            const persistKeyValueItemStorage = createPersistKeyValueItemStorage();
            const db = new OIMDB();
            const users = buildUsers(db);
            const settings = buildSettings(db, { theme: 'dark' });
            const persistor = createPersistor(persistKeyValueItemStorage);
            persistor.addPersistResource(users.createPersistResource(
                new OIMPersistKeyValuePathStrategy<TUserRecords>({ storageKey: 'app', path: ['users'] }),
            ));
            persistor.addPersistResource(settings.createPersistResource(
                new OIMPersistKeyValuePathStrategy<TSettings>({ storageKey: 'app', path: ['settings'] }),
            ));
            users.entityService.slotContentService.upsertEntity(users.entityStoreSlot,{ ...ada });
            await persistor.persist();

            await persistor.clearPersisted();

            expect(parsedItemOf(persistKeyValueItemStorage, 'app')).toEqual({});
        });
    });

    describe('a corrupt stored value', () => {
        test('does not stop an entry from overwriting it', async () => {
            const persistKeyValueItemStorage = createPersistKeyValueItemStorage();
            persistKeyValueItemStorage.setItem('app:users', '{ this is not json');
            const errors: unknown[] = [];
            const users = buildUsers(new OIMDB());
            const persistor = createPersistor(persistKeyValueItemStorage, error => errors.push(error));
            persistor.addPersistResource(users.createPersistResource(
                new OIMPersistKeyValueEntryStrategy<TUserRecords>({ storageKey: 'app:users' }),
            ));
            users.entityService.slotContentService.upsertEntity(users.entityStoreSlot,{ ...ada });
            await persistor.persist();

            expect(errors).toEqual([]);
            expect(parsedItemOf(persistKeyValueItemStorage, 'app:users')).toEqual({ records: [{ key: 'u1', entity: ada }] });
        });

        test('reaches onPersistError instead of escaping the persistor, on a shared root', async () => {
            const persistKeyValueItemStorage = createPersistKeyValueItemStorage();
            persistKeyValueItemStorage.setItem('app', '{ this is not json');
            const errors: unknown[] = [];
            const users = buildUsers(new OIMDB());
            const persistor = createPersistor(persistKeyValueItemStorage, error => errors.push(error));
            persistor.addPersistResource(users.createPersistResource(
                new OIMPersistKeyValuePathStrategy<TUserRecords>({ storageKey: 'app', path: ['users'] }),
            ));
            users.entityService.slotContentService.upsertEntity(users.entityStoreSlot,{ ...ada });
            await persistor.persist();

            expect(errors).toHaveLength(1);
            expect(persistKeyValueItemStorage.getItem('app')).toBe('{ this is not json');
        });
    });
});

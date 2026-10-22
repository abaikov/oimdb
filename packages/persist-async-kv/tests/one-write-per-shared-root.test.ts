import type { TOIMEntitySlot, TOIMStoreKey, TOIMStoreSlot } from '@oimdb/core';
import {
    OIMDB,
    createOIMEntityService,
    createOIMEntityWriterInPlace,
    createOIMSingleEntityService,
} from '@oimdb/core';
import type {
    IOIMPersistKeyValueStorage,
    IOIMPersistSnapshotStrategy,
    OIMPersistKeyValueWriteBatch,
    TOIMPersistKeyValueItemStorage,
    TOIMPersistRecords,
    TOIMPersistVersionedShape,
} from '@oimdb/persist';
import {
    OIMPersistCodecIdentity,
    OIMPersistCodecVersioned,
    OIMPersistEntityWriter,
    OIMPersistKeyValueBackend,
    OIMPersistKeyValueEntryStrategy,
    OIMPersistKeyValuePathStrategy,
    OIMPersistKeyValueStorageItemDriven,
    OIMPersistRecordSourceCollectionChangeDriven,
    OIMPersistResourceSnapshot,
    OIMPersistSchedulerMicrotaskDriven,
    OIMPersistSnapshotSourceSingleEntityDriven,
    OIMPersistor,
} from '@oimdb/persist';
import type { TOIMPersistAsyncKVMultiStorage } from '../src';
import { OIMPersistAsyncKVStorage } from '../src';

type TUser = { id: string; name: string };
type TSettings = { theme: string };
type TUserRecords = TOIMPersistRecords<TOIMStoreKey, TUser>;
type TKeyValuePersistor = OIMPersistor<OIMPersistKeyValueBackend, OIMPersistKeyValueWriteBatch>;
type TKeyValueSnapshotStrategy<TSnapshot> = IOIMPersistSnapshotStrategy<
    OIMPersistKeyValueBackend, OIMPersistKeyValueWriteBatch, TSnapshot
>;

const ada: TUser = { id: 'u1', name: 'Ada' };
const grace: TUser = { id: 'u2', name: 'Grace' };

function createAsyncKVStorage() {
    const itemByStorageKey = new Map<string, string>();
    const callCounts = { multiGet: 0, multiSet: 0, multiRemove: 0 };
    const persistAsyncKVMultiStorage: TOIMPersistAsyncKVMultiStorage = {
        multiGet: async storageKeys => {
            callCounts.multiGet++;
            return storageKeys.map(storageKey => [storageKey, itemByStorageKey.get(storageKey) ?? null] as const);
        },
        multiSet: async itemEntries => {
            callCounts.multiSet++;
            for (const [storageKey, item] of itemEntries) itemByStorageKey.set(storageKey, item);
        },
        multiRemove: async storageKeys => {
            callCounts.multiRemove++;
            for (const storageKey of storageKeys) itemByStorageKey.delete(storageKey);
        },
    };
    return { persistAsyncKVMultiStorage, itemByStorageKey, callCounts };
}

function createItemStorage() {
    const itemByStorageKey = new Map<string, string>();
    const callCounts = { getItem: 0, setItem: 0, removeItem: 0 };
    const persistKeyValueItemStorage: TOIMPersistKeyValueItemStorage = {
        getItem: async storageKey => {
            callCounts.getItem++;
            return itemByStorageKey.get(storageKey) ?? null;
        },
        setItem: async (storageKey, item) => {
            callCounts.setItem++;
            itemByStorageKey.set(storageKey, item);
        },
        removeItem: async storageKey => {
            callCounts.removeItem++;
            itemByStorageKey.delete(storageKey);
        },
    };
    return { persistKeyValueItemStorage, itemByStorageKey, callCounts };
}

function parsedItemOf(itemByStorageKey: ReadonlyMap<string, string>, storageKey: string): unknown {
    const item = itemByStorageKey.get(storageKey);
    return item === undefined ? undefined : JSON.parse(item);
}

function createPersistor(
    persistKeyValueStorage: IOIMPersistKeyValueStorage,
    onPersistError?: (error: unknown) => void,
): TKeyValuePersistor {
    return new OIMPersistor<OIMPersistKeyValueBackend, OIMPersistKeyValueWriteBatch>({
        persistBackend: new OIMPersistKeyValueBackend({ persistKeyValueStorage }),
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

function addUsersAndSettingsUnderOneRoot(persistor: TKeyValuePersistor, db: OIMDB) {
    const users = buildUsers(db);
    const settings = buildSettings(db, { theme: 'dark' });
    persistor.addPersistResource(users.createPersistResource(
        new OIMPersistKeyValuePathStrategy<TUserRecords>({ storageKey: 'app', path: ['users'] }),
    ));
    persistor.addPersistResource(settings.createPersistResource(
        new OIMPersistKeyValuePathStrategy<TSettings>({ storageKey: 'app', path: ['settings'] }),
    ));
    users.entityService.slotContentService.upsertEntity(users.entityStoreSlot,{ ...ada });
}

describe('@oimdb/persist-async-kv', () => {
    test('two path resources sharing one root key produce a single multiSet carrying both', async () => {
        const { persistAsyncKVMultiStorage, itemByStorageKey, callCounts } = createAsyncKVStorage();
        const persistor = createPersistor(new OIMPersistAsyncKVStorage({ persistAsyncKVMultiStorage }));
        addUsersAndSettingsUnderOneRoot(persistor, new OIMDB());

        await persistor.persist();

        expect(callCounts.multiSet).toBe(1);
        expect(parsedItemOf(itemByStorageKey, 'app')).toEqual({
            users: { records: [{ key: 'u1', entity: ada }] },
            settings: { theme: 'dark' },
        });
    });

    test('two path resources sharing one root key produce a single setItem on an item storage', async () => {
        const { persistKeyValueItemStorage, itemByStorageKey, callCounts } = createItemStorage();
        const persistor = createPersistor(new OIMPersistKeyValueStorageItemDriven({ persistKeyValueItemStorage }));
        addUsersAndSettingsUnderOneRoot(persistor, new OIMDB());

        await persistor.persist();

        expect(callCounts.setItem).toBe(1);
        expect(parsedItemOf(itemByStorageKey, 'app')).toEqual({
            users: { records: [{ key: 'u1', entity: ada }] },
            settings: { theme: 'dark' },
        });
    });

    test('an entry one persistor wrote, a fresh persistor over the same storage hydrates', async () => {
        const { persistAsyncKVMultiStorage } = createAsyncKVStorage();
        const persistAsyncKVStorage = new OIMPersistAsyncKVStorage({ persistAsyncKVMultiStorage });
        const sourceUsers = buildUsers(new OIMDB());
        const sourcePersistor = createPersistor(persistAsyncKVStorage);
        sourcePersistor.addPersistResource(sourceUsers.createPersistResource(
            new OIMPersistKeyValueEntryStrategy<TUserRecords>({ storageKey: 'app:users' }),
        ));
        sourceUsers.entityService.slotContentService.upsertEntities(sourceUsers.entityStoreSlot,[{ ...ada }, { ...grace }]);
        await sourcePersistor.persist();

        const targetUsers = buildUsers(new OIMDB());
        const targetPersistor = createPersistor(persistAsyncKVStorage);
        targetPersistor.addPersistResource(targetUsers.createPersistResource(
            new OIMPersistKeyValueEntryStrategy<TUserRecords>({ storageKey: 'app:users' }),
        ));
        await targetPersistor.hydrate();

        expect(entitiesOf(targetUsers.entityService, targetUsers.entityStoreSlot)).toEqual([ada, grace]);
    });

    test('an entry round-trips through an item storage that has no multi calls', async () => {
        const { persistKeyValueItemStorage } = createItemStorage();
        const persistKeyValueStorageItemDriven = new OIMPersistKeyValueStorageItemDriven({ persistKeyValueItemStorage });
        const sourceUsers = buildUsers(new OIMDB());
        const sourcePersistor = createPersistor(persistKeyValueStorageItemDriven);
        sourcePersistor.addPersistResource(sourceUsers.createPersistResource(
            new OIMPersistKeyValueEntryStrategy<TUserRecords>({ storageKey: 'app:users' }),
        ));
        sourceUsers.entityService.slotContentService.upsertEntities(sourceUsers.entityStoreSlot,[{ ...ada }, { ...grace }]);
        await sourcePersistor.persist();

        const targetUsers = buildUsers(new OIMDB());
        const targetPersistor = createPersistor(persistKeyValueStorageItemDriven);
        targetPersistor.addPersistResource(targetUsers.createPersistResource(
            new OIMPersistKeyValueEntryStrategy<TUserRecords>({ storageKey: 'app:users' }),
        ));
        await targetPersistor.hydrate();

        expect(entitiesOf(targetUsers.entityService, targetUsers.entityStoreSlot)).toEqual([ada, grace]);
    });

    test('a versioned codec envelope is what the storage holds, and it decodes on hydrate', async () => {
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
        const { persistAsyncKVMultiStorage, itemByStorageKey } = createAsyncKVStorage();
        const persistAsyncKVStorage = new OIMPersistAsyncKVStorage({ persistAsyncKVMultiStorage });
        const sourceUsers = buildUsers(new OIMDB());
        const sourcePersistor = createPersistor(persistAsyncKVStorage);
        sourcePersistor.addPersistResource(createVersionedResource(sourceUsers));
        sourceUsers.entityService.slotContentService.upsertEntities(sourceUsers.entityStoreSlot,[{ ...ada }, { ...grace }]);
        await sourcePersistor.persist();

        expect(parsedItemOf(itemByStorageKey, 'app:users')).toEqual({
            version: 1,
            data: { records: [{ key: 'u1', entity: ada }, { key: 'u2', entity: grace }] },
        });

        const targetUsers = buildUsers(new OIMDB());
        const targetPersistor = createPersistor(persistAsyncKVStorage);
        targetPersistor.addPersistResource(createVersionedResource(targetUsers));
        await targetPersistor.hydrate();

        expect(entitiesOf(targetUsers.entityService, targetUsers.entityStoreSlot)).toEqual([ada, grace]);
    });

    test('autosave writes nothing before the drain, and the whole snapshot after it', async () => {
        const { persistAsyncKVMultiStorage, itemByStorageKey } = createAsyncKVStorage();
        const users = buildUsers(new OIMDB());
        const persistor = createPersistor(new OIMPersistAsyncKVStorage({ persistAsyncKVMultiStorage }));
        persistor.addPersistResource(users.createPersistResource(
            new OIMPersistKeyValueEntryStrategy<TUserRecords>({ storageKey: 'app:users' }),
        ));
        persistor.start();

        users.entityService.slotContentService.upsertEntity(users.entityStoreSlot,{ ...ada });
        users.entityService.slotContentService.upsertEntity(users.entityStoreSlot,{ ...grace });
        expect(itemByStorageKey.has('app:users')).toBe(false);

        await Promise.resolve();
        await persistor.whenIdle();

        expect(parsedItemOf(itemByStorageKey, 'app:users')).toEqual({
            records: [{ key: 'u1', entity: ada }, { key: 'u2', entity: grace }],
        });
        persistor.destroy();
    });

    test('clearPersisted removes an entry and keeps the root of a path with its branch gone', async () => {
        const { persistAsyncKVMultiStorage, itemByStorageKey } = createAsyncKVStorage();
        const db = new OIMDB();
        const users = buildUsers(db);
        const settings = buildSettings(db, { theme: 'dark' });
        const persistor = createPersistor(new OIMPersistAsyncKVStorage({ persistAsyncKVMultiStorage }));
        persistor.addPersistResource(users.createPersistResource(
            new OIMPersistKeyValueEntryStrategy<TUserRecords>({ storageKey: 'app:users' }),
        ));
        persistor.addPersistResource(settings.createPersistResource(
            new OIMPersistKeyValuePathStrategy<TSettings>({ storageKey: 'app', path: ['settings'] }),
        ));
        users.entityService.slotContentService.upsertEntity(users.entityStoreSlot,{ ...ada });
        await persistor.persist();

        await persistor.clearPersisted();

        expect(itemByStorageKey.has('app:users')).toBe(false);
        expect(parsedItemOf(itemByStorageKey, 'app')).toEqual({});
    });

    test('a path lands at its nested address, and a fresh persistor reads it back', async () => {
        const { persistAsyncKVMultiStorage, itemByStorageKey } = createAsyncKVStorage();
        const persistAsyncKVStorage = new OIMPersistAsyncKVStorage({ persistAsyncKVMultiStorage });
        const sourceUsers = buildUsers(new OIMDB());
        const sourcePersistor = createPersistor(persistAsyncKVStorage);
        sourcePersistor.addPersistResource(sourceUsers.createPersistResource(
            new OIMPersistKeyValuePathStrategy<TUserRecords>({ storageKey: 'app', path: ['collections', 'users'] }),
        ));
        sourceUsers.entityService.slotContentService.upsertEntities(sourceUsers.entityStoreSlot,[{ ...ada }, { ...grace }]);
        await sourcePersistor.persist();

        expect(parsedItemOf(itemByStorageKey, 'app')).toEqual({
            collections: { users: { records: [{ key: 'u1', entity: ada }, { key: 'u2', entity: grace }] } },
        });

        const targetUsers = buildUsers(new OIMDB());
        const targetPersistor = createPersistor(persistAsyncKVStorage);
        targetPersistor.addPersistResource(targetUsers.createPersistResource(
            new OIMPersistKeyValuePathStrategy<TUserRecords>({ storageKey: 'app', path: ['collections', 'users'] }),
        ));
        await targetPersistor.hydrate();

        expect(entitiesOf(targetUsers.entityService, targetUsers.entityStoreSlot)).toEqual([ada, grace]);
    });

    test('a single entity round-trips through an entry', async () => {
        const { persistAsyncKVMultiStorage } = createAsyncKVStorage();
        const persistAsyncKVStorage = new OIMPersistAsyncKVStorage({ persistAsyncKVMultiStorage });
        const sourceSettings = buildSettings(new OIMDB(), { theme: 'dark' });
        const sourcePersistor = createPersistor(persistAsyncKVStorage);
        sourcePersistor.addPersistResource(sourceSettings.createPersistResource(
            new OIMPersistKeyValueEntryStrategy<TSettings>({ storageKey: 'app:settings' }),
        ));
        await sourcePersistor.persist();

        const targetSettings = buildSettings(new OIMDB(), { theme: '' });
        const targetPersistor = createPersistor(persistAsyncKVStorage);
        targetPersistor.addPersistResource(targetSettings.createPersistResource(
            new OIMPersistKeyValueEntryStrategy<TSettings>({ storageKey: 'app:settings' }),
        ));
        await targetPersistor.hydrate();

        expect(targetSettings.singleEntityService.slotContentService.findEntityByKey(targetSettings.singleEntityStoreSlot, undefined)).toEqual({ theme: 'dark' });
    });

    test('a removed resource is written neither by autosave nor by persist', async () => {
        const { persistAsyncKVMultiStorage, callCounts } = createAsyncKVStorage();
        const users = buildUsers(new OIMDB());
        const persistor = createPersistor(new OIMPersistAsyncKVStorage({ persistAsyncKVMultiStorage }));
        const persistResourceSnapshot = persistor.addPersistResource(users.createPersistResource(
            new OIMPersistKeyValueEntryStrategy<TUserRecords>({ storageKey: 'app:users' }),
        ));
        persistor.start();
        persistor.removePersistResource(persistResourceSnapshot);

        users.entityService.slotContentService.upsertEntity(users.entityStoreSlot,{ ...ada });
        await Promise.resolve();
        await persistor.whenIdle();
        await persistor.persist();

        expect(callCounts).toEqual({ multiGet: 0, multiSet: 0, multiRemove: 0 });
        persistor.destroy();
    });

    describe('a corrupt stored value', () => {
        test('does not stop an entry from overwriting it', async () => {
            const { persistAsyncKVMultiStorage, itemByStorageKey } = createAsyncKVStorage();
            itemByStorageKey.set('app:users', '{ this is not json');
            const errors: unknown[] = [];
            const users = buildUsers(new OIMDB());
            const persistor = createPersistor(new OIMPersistAsyncKVStorage({ persistAsyncKVMultiStorage }), error => errors.push(error));
            persistor.addPersistResource(users.createPersistResource(
                new OIMPersistKeyValueEntryStrategy<TUserRecords>({ storageKey: 'app:users' }),
            ));
            users.entityService.slotContentService.upsertEntity(users.entityStoreSlot,{ ...ada });
            await persistor.persist();

            expect(errors).toEqual([]);
            expect(parsedItemOf(itemByStorageKey, 'app:users')).toEqual({ records: [{ key: 'u1', entity: ada }] });
        });

        test('reaches onPersistError instead of escaping the persistor, on a shared root', async () => {
            const { persistAsyncKVMultiStorage, itemByStorageKey } = createAsyncKVStorage();
            itemByStorageKey.set('app', '{ this is not json');
            const errors: unknown[] = [];
            const users = buildUsers(new OIMDB());
            const persistor = createPersistor(new OIMPersistAsyncKVStorage({ persistAsyncKVMultiStorage }), error => errors.push(error));
            persistor.addPersistResource(users.createPersistResource(
                new OIMPersistKeyValuePathStrategy<TUserRecords>({ storageKey: 'app', path: ['users'] }),
            ));
            users.entityService.slotContentService.upsertEntity(users.entityStoreSlot,{ ...ada });
            await persistor.persist();

            expect(errors).toHaveLength(1);
            expect(itemByStorageKey.get('app')).toBe('{ this is not json');
        });

        test('an entry-only write batch does not read the storage at all', async () => {
            const { persistAsyncKVMultiStorage, itemByStorageKey, callCounts } = createAsyncKVStorage();
            const users = buildUsers(new OIMDB());
            const persistor = createPersistor(new OIMPersistAsyncKVStorage({ persistAsyncKVMultiStorage }));
            persistor.addPersistResource(users.createPersistResource(
                new OIMPersistKeyValueEntryStrategy<TUserRecords>({ storageKey: 'app:users' }),
            ));
            users.entityService.slotContentService.upsertEntity(users.entityStoreSlot,{ ...ada });
            await persistor.persist();

            expect(callCounts.multiGet).toBe(0);
            expect(itemByStorageKey.has('app:users')).toBe(true);
        });
    });
});

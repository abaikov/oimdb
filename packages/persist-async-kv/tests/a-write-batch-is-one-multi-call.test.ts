import type { TOIMStoreKey } from '@oimdb/core';
import {
    OIMDB,
    createOIMEntityService,
    createOIMEntityWriterInPlace,
    createOIMSingleEntityService,
} from '@oimdb/core';
import type { IOIMPersistSnapshotStrategy, OIMPersistKeyValueWriteBatch, TOIMPersistRecords } from '@oimdb/persist';
import {
    OIMPersistCodecIdentity,
    OIMPersistEntityWriter,
    OIMPersistKeyValueBackend,
    OIMPersistKeyValueEntryStrategy,
    OIMPersistKeyValuePathStrategy,
    OIMPersistRecordSourceCollectionChangeDriven,
    OIMPersistResourceSnapshot,
    OIMPersistSchedulerFrameDriven,
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

function createAsyncKVStorage() {
    const itemByStorageKey = new Map<string, string>();
    const multiGetCalls: string[][] = [];
    const multiSetCalls: Array<Array<[string, string]>> = [];
    const multiRemoveCalls: string[][] = [];
    const persistAsyncKVMultiStorage: TOIMPersistAsyncKVMultiStorage = {
        multiGet: async storageKeys => {
            multiGetCalls.push(storageKeys.slice());
            return storageKeys.map(storageKey => [storageKey, itemByStorageKey.get(storageKey) ?? null] as const);
        },
        multiSet: async itemEntries => {
            multiSetCalls.push(itemEntries.slice());
            for (const [storageKey, item] of itemEntries) itemByStorageKey.set(storageKey, item);
        },
        multiRemove: async storageKeys => {
            multiRemoveCalls.push(storageKeys.slice());
            for (const storageKey of storageKeys) itemByStorageKey.delete(storageKey);
        },
    };
    const forgetCalls = (): void => {
        multiGetCalls.length = 0;
        multiSetCalls.length = 0;
        multiRemoveCalls.length = 0;
    };
    return { persistAsyncKVMultiStorage, itemByStorageKey, multiGetCalls, multiSetCalls, multiRemoveCalls, forgetCalls };
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
    return { entityService, entityStoreSlot, createPersistResource };
}

function buildSettings(db: OIMDB) {
    const singleEntityService = createOIMSingleEntityService<TSettings>(db);
    const singleEntityStoreSlot = singleEntityService.createStoreSlot(db);
    singleEntityService.slotContentService.upsertEntity(singleEntityStoreSlot, { theme: '' });
    db.flush();
    const persistResourceSnapshot = new OIMPersistResourceSnapshot<
        OIMPersistKeyValueBackend, OIMPersistKeyValueWriteBatch, TSettings, TSettings
    >({
        persistSnapshotSource: new OIMPersistSnapshotSourceSingleEntityDriven<TSettings>({
            channelMap: db, singleSlotService: singleEntityService, entityStoreSlot: singleEntityStoreSlot,
        }),
        persistSnapshotStrategy: new OIMPersistKeyValuePathStrategy<TSettings>({ storageKey: 'app', path: ['settings'] }),
        persistCodec: new OIMPersistCodecIdentity<TSettings>(),
    });
    return { singleEntityService, singleEntityStoreSlot, persistResourceSnapshot };
}

function createPersistor(persistAsyncKVMultiStorage: TOIMPersistAsyncKVMultiStorage, db: OIMDB): TKeyValuePersistor {
    return new OIMPersistor<OIMPersistKeyValueBackend, OIMPersistKeyValueWriteBatch>({
        persistBackend: new OIMPersistKeyValueBackend({
            persistKeyValueStorage: new OIMPersistAsyncKVStorage({ persistAsyncKVMultiStorage }),
        }),
        persistScheduler: new OIMPersistSchedulerFrameDriven({ channelSlot: db.defaultChannelSlot }),
    });
}

function storageKeysOf(itemEntries: ReadonlyArray<[string, string]>): string[] {
    return itemEntries.map(([storageKey]) => storageKey).sort();
}

describe('one flush of several snapshot resources on an async key-value storage', () => {
    const startedPersistors: TKeyValuePersistor[] = [];
    afterEach(() => {
        for (const persistor of startedPersistors.splice(0)) persistor.destroy();
    });

    test('entries alone: one multiSet with every changed key, and no multiGet or multiRemove', async () => {
        const { persistAsyncKVMultiStorage, multiGetCalls, multiSetCalls, multiRemoveCalls } = createAsyncKVStorage();
        const db = new OIMDB();
        const users = buildUsers(db);
        const admins = buildUsers(db);
        const guests = buildUsers(db);
        const persistor = createPersistor(persistAsyncKVMultiStorage, db);
        persistor.addPersistResource(users.createPersistResource(
            new OIMPersistKeyValueEntryStrategy<TUserRecords>({ storageKey: 'app:users' }),
        ));
        persistor.addPersistResource(admins.createPersistResource(
            new OIMPersistKeyValueEntryStrategy<TUserRecords>({ storageKey: 'app:admins' }),
        ));
        persistor.addPersistResource(guests.createPersistResource(
            new OIMPersistKeyValueEntryStrategy<TUserRecords>({ storageKey: 'app:guests' }),
        ));
        startedPersistors.push(persistor);
        persistor.start();

        users.entityService.slotContentService.upsertEntity(users.entityStoreSlot,{ id: 'u1', name: 'Ada' });
        admins.entityService.slotContentService.upsertEntity(admins.entityStoreSlot,{ id: 'a1', name: 'Grace' });
        guests.entityService.slotContentService.upsertEntity(guests.entityStoreSlot,{ id: 'g1', name: 'Edsger' });
        db.flush();
        await persistor.whenIdle();

        expect(multiGetCalls).toEqual([]);
        expect(multiSetCalls).toHaveLength(1);
        expect(storageKeysOf(multiSetCalls[0])).toEqual(['app:admins', 'app:guests', 'app:users']);
        expect(multiRemoveCalls).toEqual([]);
    });

    test('paths among them: one multiGet of the roots the paths need, and still one multiSet', async () => {
        const { persistAsyncKVMultiStorage, itemByStorageKey, multiGetCalls, multiSetCalls, multiRemoveCalls } = createAsyncKVStorage();
        const db = new OIMDB();
        const users = buildUsers(db);
        const admins = buildUsers(db);
        const settings = buildSettings(db);
        const persistor = createPersistor(persistAsyncKVMultiStorage, db);
        persistor.addPersistResource(users.createPersistResource(
            new OIMPersistKeyValueEntryStrategy<TUserRecords>({ storageKey: 'app:users' }),
        ));
        persistor.addPersistResource(admins.createPersistResource(
            new OIMPersistKeyValuePathStrategy<TUserRecords>({ storageKey: 'prefs', path: ['admins'] }),
        ));
        persistor.addPersistResource(settings.persistResourceSnapshot);
        startedPersistors.push(persistor);
        persistor.start();

        users.entityService.slotContentService.upsertEntity(users.entityStoreSlot,{ id: 'u1', name: 'Ada' });
        admins.entityService.slotContentService.upsertEntity(admins.entityStoreSlot,{ id: 'a1', name: 'Grace' });
        settings.singleEntityService.slotContentService.upsertEntity(settings.singleEntityStoreSlot, { theme: 'dark' });
        db.flush();
        await persistor.whenIdle();

        expect(multiGetCalls).toHaveLength(1);
        expect(multiGetCalls[0].slice().sort()).toEqual(['app', 'prefs']);
        expect(multiSetCalls).toHaveLength(1);
        expect(storageKeysOf(multiSetCalls[0])).toEqual(['app', 'app:users', 'prefs']);
        expect(multiRemoveCalls).toEqual([]);
        expect(JSON.parse(itemByStorageKey.get('app') as string)).toEqual({ settings: { theme: 'dark' } });
    });

    test('a clear: one multiRemove for every entry, and the shared root read and written once', async () => {
        const { persistAsyncKVMultiStorage, itemByStorageKey, multiGetCalls, multiSetCalls, multiRemoveCalls, forgetCalls } =
            createAsyncKVStorage();
        const db = new OIMDB();
        const users = buildUsers(db);
        const admins = buildUsers(db);
        const settings = buildSettings(db);
        const persistor = createPersistor(persistAsyncKVMultiStorage, db);
        persistor.addPersistResource(users.createPersistResource(
            new OIMPersistKeyValueEntryStrategy<TUserRecords>({ storageKey: 'app:users' }),
        ));
        persistor.addPersistResource(admins.createPersistResource(
            new OIMPersistKeyValueEntryStrategy<TUserRecords>({ storageKey: 'app:admins' }),
        ));
        persistor.addPersistResource(settings.persistResourceSnapshot);
        users.entityService.slotContentService.upsertEntity(users.entityStoreSlot,{ id: 'u1', name: 'Ada' });
        admins.entityService.slotContentService.upsertEntity(admins.entityStoreSlot,{ id: 'a1', name: 'Grace' });
        await persistor.persist();
        forgetCalls();

        await persistor.clearPersisted();

        expect(multiRemoveCalls).toHaveLength(1);
        expect(multiRemoveCalls[0].slice().sort()).toEqual(['app:admins', 'app:users']);
        expect(multiGetCalls).toEqual([['app']]);
        expect(multiSetCalls).toHaveLength(1);
        expect(storageKeysOf(multiSetCalls[0])).toEqual(['app']);
        expect(JSON.parse(itemByStorageKey.get('app') as string)).toEqual({});
        expect(itemByStorageKey.has('app:users')).toBe(false);
        expect(itemByStorageKey.has('app:admins')).toBe(false);
    });

    test('a flush with nothing changed issues no call at all', async () => {
        const { persistAsyncKVMultiStorage, multiGetCalls, multiSetCalls, multiRemoveCalls } = createAsyncKVStorage();
        const db = new OIMDB();
        const users = buildUsers(db);
        const persistor = createPersistor(persistAsyncKVMultiStorage, db);
        persistor.addPersistResource(users.createPersistResource(
            new OIMPersistKeyValueEntryStrategy<TUserRecords>({ storageKey: 'app:users' }),
        ));
        startedPersistors.push(persistor);
        persistor.start();

        db.flush();
        await persistor.whenIdle();

        expect(multiGetCalls).toEqual([]);
        expect(multiSetCalls).toEqual([]);
        expect(multiRemoveCalls).toEqual([]);
    });
});

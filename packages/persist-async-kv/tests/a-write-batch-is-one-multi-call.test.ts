import type { TOIMStoreKey } from '@oimdb/core';
import { OIMDB, createOIMInPlaceEntityWriter } from '@oimdb/core';
import type { IOIMPersistSnapshotService, OIMPersistKeyValueWriteBatch, TOIMPersistRecords } from '@oimdb/persist';
import {
    OIMPersistIdentityCodec,
    OIMPersistEntityWriter,
    OIMPersistKeyValueBackend,
    OIMPersistKeyValueEntrySnapshotService,
    OIMPersistKeyValuePathSnapshotService,
    OIMPersistCollectionChangeWriteRecordSource,
    OIMPersistSnapshotResource,
    OIMPersistFrameScheduler,
    OIMPersistSingleEntitySnapshotSource,
    OIMPersistor,
} from '@oimdb/persist';
import type { TOIMPersistAsyncKVMultiStorage } from '../src';
import { OIMPersistAsyncKVStorage } from '../src';
import { createOIMSlotContentEntityService } from '@oimdb/core';
import { createOIMSlotCollectionService } from '@oimdb/core';
import { createOIMSingleSlotService } from '@oimdb/core';

type TUser = { id: string; name: string };
type TSettings = { theme: string };
type TUserRecords = TOIMPersistRecords<TOIMStoreKey, TUser>;
type TKeyValuePersistor = OIMPersistor<OIMPersistKeyValueBackend, OIMPersistKeyValueWriteBatch>;
type TKeyValueSnapshotStrategy<TSnapshot> = IOIMPersistSnapshotService<
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
        entityWriter: createOIMInPlaceEntityWriter(),
    });
    const entityService = createOIMSlotCollectionService({ slotContentService: createOIMSlotContentEntityService<TUser>({ entityWriter: persistEntityWriter }) });
    const entityStoreSlot = entityService.createStoreSlot(db);
    const persistRecordSource = new OIMPersistCollectionChangeWriteRecordSource<TOIMStoreKey, TUser>({
        entityCollectionService: entityService,
        entityStoreSlot,
        persistEntityWriter,
    });
    const createPersistResource = (persistSnapshotService: TKeyValueSnapshotStrategy<TUserRecords>) =>
        new OIMPersistSnapshotResource<OIMPersistKeyValueBackend, OIMPersistKeyValueWriteBatch, TUserRecords, TUserRecords>({
            persistSnapshotSource: persistRecordSource,
            persistSnapshotService,
            persistCodec: new OIMPersistIdentityCodec<TUserRecords>(),
        });
    return { entityService, entityStoreSlot, createPersistResource };
}

function buildSettings(db: OIMDB) {
    const singleEntityService = createOIMSingleSlotService({ slotContentService: createOIMSlotContentEntityService<TSettings>() });
    const singleEntityStoreSlot = singleEntityService.createStoreSlot(db);
    singleEntityService.writeSingleSlotContent(singleEntityStoreSlot, { theme: '' });
    db.flush();
    const persistSnapshotResource = new OIMPersistSnapshotResource<
        OIMPersistKeyValueBackend, OIMPersistKeyValueWriteBatch, TSettings, TSettings
    >({
        persistSnapshotSource: new OIMPersistSingleEntitySnapshotSource<TSettings>({
            channelMap: db, singleSlotService: singleEntityService, entityStoreSlot: singleEntityStoreSlot,
        }),
        persistSnapshotService: new OIMPersistKeyValuePathSnapshotService<TSettings>({ storageKey: 'app', path: ['settings'] }),
        persistCodec: new OIMPersistIdentityCodec<TSettings>(),
    });
    return { singleEntityService, singleEntityStoreSlot, persistSnapshotResource };
}

function createPersistor(persistAsyncKVMultiStorage: TOIMPersistAsyncKVMultiStorage, db: OIMDB): TKeyValuePersistor {
    return new OIMPersistor<OIMPersistKeyValueBackend, OIMPersistKeyValueWriteBatch>({
        persistBackend: new OIMPersistKeyValueBackend({
            persistKeyValueStorage: new OIMPersistAsyncKVStorage({ persistAsyncKVMultiStorage }),
        }),
        persistScheduler: new OIMPersistFrameScheduler({ channelSlot: db.defaultChannelSlot }),
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
            new OIMPersistKeyValueEntrySnapshotService<TUserRecords>({ storageKey: 'app:users' }),
        ));
        persistor.addPersistResource(admins.createPersistResource(
            new OIMPersistKeyValueEntrySnapshotService<TUserRecords>({ storageKey: 'app:admins' }),
        ));
        persistor.addPersistResource(guests.createPersistResource(
            new OIMPersistKeyValueEntrySnapshotService<TUserRecords>({ storageKey: 'app:guests' }),
        ));
        startedPersistors.push(persistor);
        persistor.start();

        users.entityService.writeSlotContentByKey(users.entityStoreSlot, 'u1', { id: 'u1', name: 'Ada' });
        admins.entityService.writeSlotContentByKey(admins.entityStoreSlot, 'a1', { id: 'a1', name: 'Grace' });
        guests.entityService.writeSlotContentByKey(guests.entityStoreSlot, 'g1', { id: 'g1', name: 'Edsger' });
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
            new OIMPersistKeyValueEntrySnapshotService<TUserRecords>({ storageKey: 'app:users' }),
        ));
        persistor.addPersistResource(admins.createPersistResource(
            new OIMPersistKeyValuePathSnapshotService<TUserRecords>({ storageKey: 'prefs', path: ['admins'] }),
        ));
        persistor.addPersistResource(settings.persistSnapshotResource);
        startedPersistors.push(persistor);
        persistor.start();

        users.entityService.writeSlotContentByKey(users.entityStoreSlot, 'u1', { id: 'u1', name: 'Ada' });
        admins.entityService.writeSlotContentByKey(admins.entityStoreSlot, 'a1', { id: 'a1', name: 'Grace' });
        settings.singleEntityService.writeSingleSlotContent(settings.singleEntityStoreSlot, { theme: 'dark' });
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
            new OIMPersistKeyValueEntrySnapshotService<TUserRecords>({ storageKey: 'app:users' }),
        ));
        persistor.addPersistResource(admins.createPersistResource(
            new OIMPersistKeyValueEntrySnapshotService<TUserRecords>({ storageKey: 'app:admins' }),
        ));
        persistor.addPersistResource(settings.persistSnapshotResource);
        users.entityService.writeSlotContentByKey(users.entityStoreSlot, 'u1', { id: 'u1', name: 'Ada' });
        admins.entityService.writeSlotContentByKey(admins.entityStoreSlot, 'a1', { id: 'a1', name: 'Grace' });
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
            new OIMPersistKeyValueEntrySnapshotService<TUserRecords>({ storageKey: 'app:users' }),
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

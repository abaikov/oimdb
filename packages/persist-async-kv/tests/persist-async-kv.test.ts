import { OIMCollection, OIMEventQueue, OIMObject } from '@oimdb/core';
import { createAsyncKVPersistor, TOIMAsyncKVLike } from '../src';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

type User = {
    id: string;
    name: string;
};

type Mock = TOIMAsyncKVLike & {
    data: Map<string, string>;
    setItemCalls: number;
    multiSetCalls: number;
};

/**
 * In-memory mock WITH batch operations (multiGet / multiSet / multiRemove).
 */
function createBatchMock(): Mock {
    const data = new Map<string, string>();
    const mock: Mock = {
        data,
        setItemCalls: 0,
        multiSetCalls: 0,
        async getItem(key) {
            return data.get(key) ?? null;
        },
        async setItem(key, value) {
            mock.setItemCalls++;
            data.set(key, value);
        },
        async removeItem(key) {
            data.delete(key);
        },
        async multiGet(keys) {
            return keys.map(
                key => [key, data.get(key) ?? null] as const
            );
        },
        async multiSet(pairs) {
            mock.multiSetCalls++;
            for (const [key, value] of pairs) data.set(key, value);
        },
        async multiRemove(keys) {
            for (const key of keys) data.delete(key);
        },
    };
    return mock;
}

/**
 * In-memory mock WITHOUT batch operations (sequential fallback only).
 */
function createSequentialMock(): Mock {
    const data = new Map<string, string>();
    const mock: Mock = {
        data,
        setItemCalls: 0,
        multiSetCalls: 0,
        async getItem(key) {
            return data.get(key) ?? null;
        },
        async setItem(key, value) {
            mock.setItemCalls++;
            data.set(key, value);
        },
        async removeItem(key) {
            data.delete(key);
        },
    };
    return mock;
}

describe('@oimdb/persist-async-kv', () => {
    test('entry persist -> hydrate roundtrip', async () => {
        const storage = createBatchMock();
        const sourcePersistor = createAsyncKVPersistor({ storage });
        const sourceUsers = new OIMCollection<User, string>();
        sourcePersistor
            .collection(sourceUsers)
            .entry({ storageKey: 'app:users' });
        sourceUsers.upsertMany([
            { id: 'u1', name: 'Ada' },
            { id: 'u2', name: 'Grace' },
        ]);
        await sourcePersistor.persist();

        const targetUsers = new OIMCollection<User, string>();
        const targetPersistor = createAsyncKVPersistor({ storage });
        targetPersistor
            .collection(targetUsers)
            .entry({ storageKey: 'app:users' });
        await targetPersistor.hydrate();

        expect(targetUsers.getAll()).toEqual([
            { id: 'u1', name: 'Ada' },
            { id: 'u2', name: 'Grace' },
        ]);
    });

    test('path persist -> hydrate roundtrip', async () => {
        const storage = createBatchMock();
        const sourcePersistor = createAsyncKVPersistor({ storage });
        const sourceUsers = new OIMCollection<User, string>();
        sourcePersistor
            .collection(sourceUsers)
            .path({ storageKey: 'app', path: ['collections', 'users'] });
        sourceUsers.upsertMany([
            { id: 'u1', name: 'Ada' },
            { id: 'u2', name: 'Grace' },
        ]);
        await sourcePersistor.persist();

        const targetUsers = new OIMCollection<User, string>();
        const targetPersistor = createAsyncKVPersistor({ storage });
        targetPersistor
            .collection(targetUsers)
            .path({ storageKey: 'app', path: ['collections', 'users'] });
        await targetPersistor.hydrate();

        expect(targetUsers.getAll()).toEqual([
            { id: 'u1', name: 'Ada' },
            { id: 'u2', name: 'Grace' },
        ]);
    });

    test('two path resources sharing one root key produce a single multiSet', async () => {
        const storage = createBatchMock();
        const persistor = createAsyncKVPersistor({ storage });
        const users = new OIMCollection<User, string>();
        const settings = new OIMObject<'theme', string>();

        persistor.collection(users).path({ storageKey: 'app', path: ['users'] });
        persistor
            .object(settings)
            .path({ storageKey: 'app', path: ['settings'] });

        users.upsertOne({ id: 'u1', name: 'Ada' });
        settings.setProperty('theme', 'dark');
        await persistor.persist();

        expect(storage.multiSetCalls).toBe(1);
        const root = JSON.parse(storage.data.get('app')!);
        expect(root.users.records).toHaveLength(1);
        expect(root.settings).toEqual({ theme: 'dark' });
    });

    test('two path resources sharing one root key produce a single setItem (sequential fallback)', async () => {
        const storage = createSequentialMock();
        const persistor = createAsyncKVPersistor({ storage });
        const users = new OIMCollection<User, string>();
        const settings = new OIMObject<'theme', string>();

        persistor.collection(users).path({ storageKey: 'app', path: ['users'] });
        persistor
            .object(settings)
            .path({ storageKey: 'app', path: ['settings'] });

        users.upsertOne({ id: 'u1', name: 'Ada' });
        settings.setProperty('theme', 'dark');
        await persistor.persist();

        expect(storage.setItemCalls).toBe(1);
    });

    test('entry roundtrip works via sequential ops (no multi*)', async () => {
        const storage = createSequentialMock();
        const sourcePersistor = createAsyncKVPersistor({ storage });
        const sourceUsers = new OIMCollection<User, string>();
        sourcePersistor
            .collection(sourceUsers)
            .entry({ storageKey: 'app:users' });
        sourceUsers.upsertMany([
            { id: 'u1', name: 'Ada' },
            { id: 'u2', name: 'Grace' },
        ]);
        await sourcePersistor.persist();

        const targetUsers = new OIMCollection<User, string>();
        const targetPersistor = createAsyncKVPersistor({ storage });
        targetPersistor
            .collection(targetUsers)
            .entry({ storageKey: 'app:users' });
        await targetPersistor.hydrate();

        expect(targetUsers.getAll()).toEqual([
            { id: 'u1', name: 'Ada' },
            { id: 'u2', name: 'Grace' },
        ]);
    });

    test('autosave: queue batches mutations, nothing written before flush', async () => {
        const storage = createBatchMock();
        const queue = new OIMEventQueue();
        const persistor = createAsyncKVPersistor({ storage, queue });
        const users = new OIMCollection<User, string>();
        persistor.collection(users).entry({ storageKey: 'app:users' });

        persistor.start();
        users.upsertOne({ id: 'u1', name: 'Ada' });
        users.upsertOne({ id: 'u2', name: 'Grace' });
        expect(await storage.getItem('app:users')).toBeNull();

        queue.flush();
        await tick();

        expect(JSON.parse(storage.data.get('app:users')!)).toEqual({
            records: [
                { pk: 'u1', value: { id: 'u1', name: 'Ada' } },
                { pk: 'u2', value: { id: 'u2', name: 'Grace' } },
            ],
        });
        persistor.destroy();
    });

    test('clearPersisted removes the written key', async () => {
        const storage = createBatchMock();
        const persistor = createAsyncKVPersistor({ storage });
        const users = new OIMCollection<User, string>();
        persistor.collection(users).entry({ storageKey: 'app:users' });

        users.upsertOne({ id: 'u1', name: 'Ada' });
        await persistor.persist();
        expect(await storage.getItem('app:users')).not.toBeNull();

        await persistor.clearPersisted();
        expect(await storage.getItem('app:users')).toBeNull();
    });
});

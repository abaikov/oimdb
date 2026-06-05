import { OIMCollection, OIMEventQueue, OIMObject } from '@oimdb/core';
import {
    createLocalStoragePersistor,
    TOIMLocalStorageLike,
} from '../src';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

type User = {
    id: string;
    name: string;
};

function createLocalStorageMock(): TOIMLocalStorageLike {
    const data = new Map<string, string>();
    return {
        getItem: key => data.get(key) ?? null,
        setItem: (key, value) => {
            data.set(key, value);
        },
        removeItem: key => {
            data.delete(key);
        },
    };
}

describe('@oimdb/persist-localstorage', () => {
    test('persists collection snapshot into one localStorage key', async () => {
        const storage = createLocalStorageMock();
        const persistor = createLocalStoragePersistor({ storage });
        const users = new OIMCollection<User, string>();

        persistor.collection(users).entry({ storageKey: 'app:users' });
        users.upsertOne({ id: 'u1', name: 'Ada' });
        await persistor.persist();

        expect(JSON.parse(storage.getItem('app:users')!)).toEqual({
            records: [{ pk: 'u1', value: { id: 'u1', name: 'Ada' } }],
        });
    });

    test('persists collection snapshot into a path inside one localStorage key', async () => {
        const storage = createLocalStorageMock();
        const persistor = createLocalStoragePersistor({ storage });
        const users = new OIMCollection<User, string>();

        persistor
            .collection(users)
            .path({ storageKey: 'app', path: ['collections', 'users'] });
        users.upsertOne({ id: 'u1', name: 'Ada' });
        await persistor.persist();

        expect(JSON.parse(storage.getItem('app')!)).toEqual({
            collections: {
                users: {
                    records: [{ pk: 'u1', value: { id: 'u1', name: 'Ada' } }],
                },
            },
        });
    });

    test('two path strategies sharing the same root key produce one write', async () => {
        const storage = createLocalStorageMock();
        const persistor = createLocalStoragePersistor({ storage });
        const users = new OIMCollection<User, string>();
        const settings = new OIMObject<'theme', string>();

        persistor.collection(users).path({ storageKey: 'app', path: ['users'] });
        persistor
            .object(settings)
            .path({ storageKey: 'app', path: ['settings'] });

        users.upsertOne({ id: 'u1', name: 'Ada' });
        settings.setProperty('theme', 'dark');
        await persistor.persist();

        const root = JSON.parse(storage.getItem('app')!);
        expect(root.users.records).toHaveLength(1);
        expect(root.settings).toEqual({ theme: 'dark' });
    });

    test('hydrate roundtrip via entry: a fresh persistor restores the data', async () => {
        const storage = createLocalStorageMock();
        const sourcePersistor = createLocalStoragePersistor({ storage });
        const sourceUsers = new OIMCollection<User, string>();
        sourcePersistor.collection(sourceUsers).entry({ storageKey: 'app:users' });
        sourceUsers.upsertMany([
            { id: 'u1', name: 'Ada' },
            { id: 'u2', name: 'Grace' },
        ]);
        await sourcePersistor.persist();

        const targetUsers = new OIMCollection<User, string>();
        const targetPersistor = createLocalStoragePersistor({ storage });
        targetPersistor.collection(targetUsers).entry({ storageKey: 'app:users' });
        await targetPersistor.hydrate();

        expect(targetUsers.getAll()).toEqual([
            { id: 'u1', name: 'Ada' },
            { id: 'u2', name: 'Grace' },
        ]);
    });

    test('hydrate roundtrip via path: a fresh persistor restores the data', async () => {
        const storage = createLocalStorageMock();
        const sourcePersistor = createLocalStoragePersistor({ storage });
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
        const targetPersistor = createLocalStoragePersistor({ storage });
        targetPersistor
            .collection(targetUsers)
            .path({ storageKey: 'app', path: ['collections', 'users'] });
        await targetPersistor.hydrate();

        expect(targetUsers.getAll()).toEqual([
            { id: 'u1', name: 'Ada' },
            { id: 'u2', name: 'Grace' },
        ]);
    });

    test('autosave: queue batches mutations, nothing written before flush', async () => {
        const storage = createLocalStorageMock();
        const queue = new OIMEventQueue();
        const persistor = createLocalStoragePersistor({ storage, queue });
        const users = new OIMCollection<User, string>();
        persistor.collection(users).entry({ storageKey: 'app:users' });

        persistor.start();
        users.upsertOne({ id: 'u1', name: 'Ada' });
        users.upsertOne({ id: 'u2', name: 'Grace' });
        expect(storage.getItem('app:users')).toBeNull();

        queue.flush();
        await tick();

        expect(JSON.parse(storage.getItem('app:users')!)).toEqual({
            records: [
                { pk: 'u1', value: { id: 'u1', name: 'Ada' } },
                { pk: 'u2', value: { id: 'u2', name: 'Grace' } },
            ],
        });
        persistor.destroy();
    });

    test('clearPersisted removes the written key', async () => {
        const storage = createLocalStorageMock();
        const persistor = createLocalStoragePersistor({ storage });
        const users = new OIMCollection<User, string>();
        persistor.collection(users).entry({ storageKey: 'app:users' });

        users.upsertOne({ id: 'u1', name: 'Ada' });
        await persistor.persist();
        expect(storage.getItem('app:users')).not.toBeNull();

        await persistor.clearPersisted();
        expect(storage.getItem('app:users')).toBeNull();
    });

    test('clearPersisted removes a nested path while keeping the root key', async () => {
        const storage = createLocalStorageMock();
        const persistor = createLocalStoragePersistor({ storage });
        const users = new OIMCollection<User, string>();
        const settings = new OIMObject<'theme', string>();

        persistor.collection(users).path({ storageKey: 'app', path: ['users'] });
        persistor
            .object(settings)
            .path({ storageKey: 'app', path: ['settings'] });

        users.upsertOne({ id: 'u1', name: 'Ada' });
        settings.setProperty('theme', 'dark');
        await persistor.persist();

        await persistor.clearPersisted();

        const root = JSON.parse(storage.getItem('app')!);
        expect(root.users).toBeUndefined();
        expect(root.settings).toBeUndefined();
    });

    test('removeResource stops autosave for that resource', async () => {
        const storage = createLocalStorageMock();
        const persistor = createLocalStoragePersistor({ storage });
        const users = new OIMCollection<User, string>();
        const resource = persistor
            .collection(users)
            .entry({ storageKey: 'app:users' });

        persistor.start();
        persistor.removeResource(resource);

        users.upsertOne({ id: 'u1', name: 'Ada' });
        await persistor.persist();

        expect(storage.getItem('app:users')).toBeNull();
        persistor.destroy();
    });
});

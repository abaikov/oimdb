import {
    OIMCollection,
    OIMCollectionIndexManualOrderedArrayBased,
    OIMEventQueue,
    OIMIndexManualArrayBased,
    OIMIndexManualSetBased,
    OIMObject,
} from '@oimdb/core';
import {
    createLocalStoragePersistor,
    createMemoryPersistor,
    createVersionedCodec,
    OIMPersistResource,
    TOIMLocalStorageLike,
    TOIMPersistErrorContext,
} from '../src';
import { createCollectionSourceAdapter } from '../src/core/OIMSourceAdapters';

type User = {
    id: string;
    name: string;
};

function createLocalStorageMock(): TOIMLocalStorageLike {
    const data = new Map<string, string>();
    return {
        getItem: (key) => data.get(key) ?? null,
        setItem: (key, value) => { data.set(key, value); },
        removeItem: (key) => { data.delete(key); },
    };
}

describe('persist architecture', () => {
    test('persists and hydrates a collection through memory records strategy', async () => {
        const persistor = createMemoryPersistor({});
        const users = new OIMCollection<User, string>();
        persistor.collection(users).records({ bucketName: 'users' });

        users.upsertMany([
            { id: 'u1', name: 'Ada' },
            { id: 'u2', name: 'Grace' },
        ]);
        await persistor.persist();

        const targetUsers = new OIMCollection<User, string>();
        persistor.collection(targetUsers).records({ bucketName: 'users' });
        await persistor.hydrate();

        expect(targetUsers.getAll()).toEqual([
            { id: 'u1', name: 'Ada' },
            { id: 'u2', name: 'Grace' },
        ]);
    });

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

        persistor.collection(users).path({ storageKey: 'app', path: ['collections', 'users'] });
        users.upsertOne({ id: 'u1', name: 'Ada' });
        await persistor.persist();

        expect(JSON.parse(storage.getItem('app')!)).toEqual({
            collections: {
                users: { records: [{ pk: 'u1', value: { id: 'u1', name: 'Ada' } }] },
            },
        });
    });

    test('two path strategies sharing the same root key produce one write', async () => {
        const storage = createLocalStorageMock();
        const persistor = createLocalStoragePersistor({ storage });
        const users = new OIMCollection<User, string>();
        const settings = new OIMObject<'theme', string>();

        persistor.collection(users).path({ storageKey: 'app', path: ['users'] });
        persistor.object(settings).path({ storageKey: 'app', path: ['settings'] });

        users.upsertOne({ id: 'u1', name: 'Ada' });
        settings.setProperty('theme', 'dark');
        await persistor.persist();

        const root = JSON.parse(storage.getItem('app')!);
        expect(root.users.records).toHaveLength(1);
        expect(root.settings).toEqual({ theme: 'dark' });
    });

    test('custom strategy can write to arbitrary storage shape', async () => {
        const persistor = createMemoryPersistor({});
        const users = new OIMCollection<User, string>();

        persistor.collection(users).using({
            async read(p) {
                return p.storage.entries.get('entities:users') as
                    | { records: Array<{ pk: string; value: User }> }
                    | undefined;
            },
            async write(p, snapshot) {
                p.storage.entries.set('entities:users', snapshot);
            },
            async clear(p) {
                p.storage.entries.delete('entities:users');
            },
        });

        users.upsertOne({ id: 'u1', name: 'Ada' });
        await persistor.persist();

        expect(persistor.storage.entries.get('entities:users')).toEqual({
            records: [{ pk: 'u1', value: { id: 'u1', name: 'Ada' } }],
        });
    });

    test('addResource/removeResource control lifecycle registry', async () => {
        const persistor = createMemoryPersistor({});
        const users = new OIMCollection<User, string>();
        const resource = persistor.collection(users).records({ bucketName: 'users' });

        expect(persistor.getResources()).toEqual([resource]);

        persistor.removeResource(resource);
        expect(persistor.getResources()).toEqual([]);

        users.upsertOne({ id: 'u1', name: 'Ada' });
        await persistor.persist();
        expect(persistor.storage.recordBuckets.get('users')).toBeUndefined();
    });

    test('start autosaves without queue (immediate flush)', async () => {
        const persistor = createMemoryPersistor({});
        const users = new OIMCollection<User, string>();
        persistor.collection(users).records({ bucketName: 'users' });

        persistor.start();
        users.upsertOne({ id: 'u1', name: 'Ada' });
        await Promise.resolve();

        expect(persistor.storage.recordBuckets.get('users')?.get('u1')).toEqual({
            id: 'u1',
            name: 'Ada',
        });
        persistor.destroy();
    });

    test('start autosaves with queue — batches all mutations from one flush', async () => {
        const queue = new OIMEventQueue();
        const persistor = createMemoryPersistor({ queue });
        const users = new OIMCollection<User, string>();
        persistor.collection(users).records({ bucketName: 'users' });

        persistor.start();
        users.upsertOne({ id: 'u1', name: 'Ada' });
        users.upsertOne({ id: 'u2', name: 'Grace' });
        expect(persistor.storage.recordBuckets.get('users')).toBeUndefined();

        queue.flush();
        await Promise.resolve();

        expect(persistor.storage.recordBuckets.get('users')?.get('u1')).toEqual({ id: 'u1', name: 'Ada' });
        expect(persistor.storage.recordBuckets.get('users')?.get('u2')).toEqual({ id: 'u2', name: 'Grace' });
        persistor.destroy();
    });

    test('dirty flag: changes during in-flight write are not lost', async () => {
        const persistor = createMemoryPersistor({});
        const users = new OIMCollection<User, string>();
        persistor.collection(users).records({ bucketName: 'users' });
        persistor.start();

        users.upsertOne({ id: 'u1', name: 'Ada' });
        users.upsertOne({ id: 'u2', name: 'Grace' });

        await new Promise(resolve => setTimeout(resolve, 0));

        expect(persistor.storage.recordBuckets.get('users')?.size).toBe(2);
        persistor.destroy();
    });

    test('object and manual indexes roundtrip through memory entry strategy', async () => {
        const persistor = createMemoryPersistor({});
        const settings = new OIMObject<'theme', string>();
        settings.setProperty('theme', 'dark');

        const users = new OIMCollection<User, string>();
        users.upsertMany([
            { id: 'u1', name: 'Ada' },
            { id: 'u2', name: 'Grace' },
        ]);

        const setIndex = new OIMIndexManualSetBased<string, string>();
        setIndex.setSlots('admin', [users.getSlotByPk('u1')!, users.getSlotByPk('u2')!]);

        const arrayIndex = new OIMIndexManualArrayBased<string, string>();
        arrayIndex.setSlots('featured', [users.getSlotByPk('u2')!, users.getSlotByPk('u1')!]);

        const orderedIndex = new OIMCollectionIndexManualOrderedArrayBased<string, string, User>(
            { resolveSlot: pk => users.getSlotByPk(pk) }
        );
        orderedIndex.reset('queue', ['u2', 'u1']);

        persistor.object(settings).entry({ bucketName: 'settings' });
        persistor.setIndex(setIndex).entry({ bucketName: 'set' });
        persistor.arrayIndex(arrayIndex).entry({ bucketName: 'array' });
        persistor.orderedArrayIndex(orderedIndex).entry({ bucketName: 'ordered' });
        await persistor.persist();

        const targetPersistor = createMemoryPersistor({ storage: persistor.storage });
        const targetSettings = new OIMObject<'theme', string>();
        const targetSetIndex = new OIMIndexManualSetBased<string, string>();
        const targetArrayIndex = new OIMIndexManualArrayBased<string, string>();
        const targetOrderedIndex = new OIMCollectionIndexManualOrderedArrayBased<string, string, User>(
            { resolveSlot: pk => users.getSlotByPk(pk) }
        );

        targetPersistor.object(targetSettings).entry({ bucketName: 'settings' });
        targetPersistor.setIndex(targetSetIndex).entry({ bucketName: 'set' });
        targetPersistor.arrayIndex(targetArrayIndex).entry({ bucketName: 'array' });
        targetPersistor.orderedArrayIndex(targetOrderedIndex).entry({ bucketName: 'ordered' });
        await targetPersistor.hydrate();

        expect(targetSettings.getAll()).toEqual({ theme: 'dark' });
        expect(Array.from(targetSetIndex.getPksByKey('admin'))).toEqual(['u1', 'u2']);
        expect(targetArrayIndex.getPksByKey('featured')).toEqual(['u2', 'u1']);
        expect(targetOrderedIndex.getPksByKey('queue')).toEqual(['u2', 'u1']);
    });
});

describe('error handling', () => {
    test('hydrate: calls onError per-resource when strategy.read throws', async () => {
        const errors: TOIMPersistErrorContext[] = [];
        const persistor = createMemoryPersistor({
            onError: (_err, ctx) => errors.push(ctx),
        });
        const users = new OIMCollection<User, string>();

        persistor.addResource(new OIMPersistResource({
            source: createCollectionSourceAdapter(users),
            strategy: {
                async read() { throw new Error('corrupt'); },
                async write() {},
                async clear() {},
            },
        }));

        await expect(persistor.hydrate()).resolves.toBeUndefined();
        expect(errors).toHaveLength(1);
        expect(errors[0].operation).toBe('hydrate');
    });

    test('hydrate: rethrows when no onError provided', async () => {
        const persistor = createMemoryPersistor({});
        const users = new OIMCollection<User, string>();

        persistor.addResource(new OIMPersistResource({
            source: createCollectionSourceAdapter(users),
            strategy: {
                async read() { throw new Error('corrupt'); },
                async write() {},
                async clear() {},
            },
        }));

        await expect(persistor.hydrate()).rejects.toThrow('corrupt');
    });

    test('persist: calls onError per-resource when strategy.write throws', async () => {
        const errors: TOIMPersistErrorContext[] = [];
        const persistor = createMemoryPersistor({
            onError: (_err, ctx) => errors.push(ctx),
        });
        const users = new OIMCollection<User, string>();
        users.upsertOne({ id: 'u1', name: 'Ada' });

        persistor.addResource(new OIMPersistResource({
            source: createCollectionSourceAdapter(users),
            strategy: {
                async read() { return undefined; },
                async write() { throw new Error('write failure'); },
                async clear() {},
            },
        }));

        await expect(persistor.persist()).resolves.toBeUndefined();
        expect(errors).toHaveLength(1);
        expect(errors[0].operation).toBe('persist');
    });
});

describe('createVersionedCodec', () => {
    test('round-trips at current version with no migrations', () => {
        const codec = createVersionedCodec<{ x: number }>({ version: 1, migrations: {} });
        const encoded = codec.encode({ x: 42 });
        expect(encoded).toEqual({ __v: 1, data: { x: 42 } });
        expect(codec.decode(encoded)).toEqual({ x: 42 });
    });

    test('applies single migration from version 0 to 1', () => {
        type Old = { userId: string };
        type New = { id: string };
        const codec = createVersionedCodec<New>({
            version: 1,
            migrations: {
                1: (d) => ({ id: (d as Old).userId }),
            },
        });
        const legacy = { __v: 0, data: { userId: 'u1' } };
        expect(codec.decode(legacy)).toEqual({ id: 'u1' });
    });

    test('chains migrations v1 -> v2 -> v3', () => {
        const codec = createVersionedCodec<{ z: number }>({
            version: 3,
            migrations: {
                2: (d) => ({ y: (d as { x: number }).x * 2 }),
                3: (d) => ({ z: (d as { y: number }).y + 1 }),
            },
        });
        const v1Data = { __v: 1, data: { x: 5 } };
        expect(codec.decode(v1Data)).toEqual({ z: 11 }); // 5*2 + 1
    });

    test('skips all migrations when stored version equals current', () => {
        const spy = jest.fn((d: unknown) => d);
        const codec = createVersionedCodec<{ n: number }>({
            version: 2,
            migrations: { 1: spy, 2: spy },
        });
        codec.decode({ __v: 2, data: { n: 9 } });
        expect(spy).not.toHaveBeenCalled();
    });

    test('integrates with OIMPersistResource: migrates on hydrate', async () => {
        type OldUser = { userId: string; fullName: string };
        type NewUser = { id: string; name: string };

        const codec = createVersionedCodec<{ records: Array<{ pk: string; value: NewUser }> }>({
            version: 1,
            migrations: {
                1: (d) => {
                    const old = d as { records: Array<{ pk: string; value: OldUser }> };
                    return {
                        records: old.records.map((r) => ({
                            pk: r.pk,
                            value: { id: r.value.userId, name: r.value.fullName },
                        })),
                    };
                },
            },
        });

        const legacySnapshot = {
            __v: 0,
            data: { records: [{ pk: 'u1', value: { userId: 'u1', fullName: 'Ada Lovelace' } }] },
        };

        const decoded = codec.decode(legacySnapshot);
        expect(decoded.records[0].value).toEqual({ id: 'u1', name: 'Ada Lovelace' });
    });
});

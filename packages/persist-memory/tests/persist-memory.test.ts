import {
    OIMCollection,
    OIMCollectionIndexManualOrderedArrayBased,
    OIMEventQueue,
    OIMIndexManualArrayBased,
    OIMIndexManualSetBased,
    OIMObject,
} from '@oimdb/core';
import { createVersionedCodec } from '@oimdb/persist';
import { createMemoryPersistor } from '../src';

type User = {
    id: string;
    name: string;
};

describe('@oimdb/persist-memory', () => {
    test('persists and hydrates a collection through the records strategy', async () => {
        const persistor = createMemoryPersistor({});
        const users = new OIMCollection<User, string>();
        persistor.collection(users).records({ bucketName: 'users' });

        users.upsertMany([
            { id: 'u1', name: 'Ada' },
            { id: 'u2', name: 'Grace' },
        ]);
        await persistor.persist();

        const targetUsers = new OIMCollection<User, string>();
        const targetPersistor = createMemoryPersistor({ storage: persistor.storage });
        targetPersistor.collection(targetUsers).records({ bucketName: 'users' });
        await targetPersistor.hydrate();

        expect(targetUsers.getAll()).toEqual([
            { id: 'u1', name: 'Ada' },
            { id: 'u2', name: 'Grace' },
        ]);
    });

    test('custom strategy can write to an arbitrary storage shape', async () => {
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

    test('autosave: start writes through on every flush', async () => {
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

    test('object and manual indexes roundtrip through the entry strategy', async () => {
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

    test('autosave: queue batches mutations, nothing before flush, both rows after', async () => {
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

        const bucket = persistor.storage.recordBuckets.get('users');
        expect(bucket?.get('u1')).toEqual({ id: 'u1', name: 'Ada' });
        expect(bucket?.get('u2')).toEqual({ id: 'u2', name: 'Grace' });
        persistor.destroy();
    });

    test('clearPersisted removes the record bucket', async () => {
        const persistor = createMemoryPersistor({});
        const users = new OIMCollection<User, string>();
        persistor.collection(users).records({ bucketName: 'users' });

        users.upsertOne({ id: 'u1', name: 'Ada' });
        await persistor.persist();
        expect(persistor.storage.recordBuckets.get('users')).toBeDefined();

        await persistor.clearPersisted();
        expect(persistor.storage.recordBuckets.get('users')).toBeUndefined();
    });

    test('codec roundtrip via entry: snapshot is encoded on write and decoded on hydrate', async () => {
        const codec = createVersionedCodec<{
            records: Array<{ pk: string; value: User }>;
        }>({ version: 1, migrations: {} });

        const persistor = createMemoryPersistor({});
        const users = new OIMCollection<User, string>();
        persistor.collection(users).entry({ bucketName: 'users' }, codec);

        users.upsertMany([
            { id: 'u1', name: 'Ada' },
            { id: 'u2', name: 'Grace' },
        ]);
        await persistor.persist();

        // The stored value is the encoded (versioned) snapshot, not the raw one.
        expect(persistor.storage.entries.get('users')).toEqual({
            __v: 1,
            data: {
                records: [
                    { pk: 'u1', value: { id: 'u1', name: 'Ada' } },
                    { pk: 'u2', value: { id: 'u2', name: 'Grace' } },
                ],
            },
        });

        const targetUsers = new OIMCollection<User, string>();
        const targetPersistor = createMemoryPersistor({
            storage: persistor.storage,
        });
        targetPersistor
            .collection(targetUsers)
            .entry({ bucketName: 'users' }, codec);
        await targetPersistor.hydrate();

        expect(targetUsers.getAll()).toEqual([
            { id: 'u1', name: 'Ada' },
            { id: 'u2', name: 'Grace' },
        ]);
    });
});

import { IDBFactory } from 'fake-indexeddb';
import {
    OIMCollection,
    OIMEventQueue,
    OIMIndexManualSetBased,
    OIMObject,
    OIMReactiveCollection,
} from '@oimdb/core';
import { createIndexedDbPersistor } from '../src';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

type User = {
    id: string;
    name: string;
};

describe('@oimdb/persist-idb', () => {
    test('persists and hydrates a collection through the entry strategy', async () => {
        const indexedDb = new IDBFactory();
        const databaseName = 'entry-roundtrip-db';

        const persistor = createIndexedDbPersistor({
            databaseName,
            indexedDb,
        });
        const users = new OIMCollection<User, string>();
        persistor
            .collection(users)
            .entry({ tableName: 'collections', primaryKey: 'users' });

        users.upsertMany([
            { id: 'u1', name: 'Ada' },
            { id: 'u2', name: 'Grace' },
        ]);
        await persistor.persist();

        const targetUsers = new OIMCollection<User, string>();
        const targetPersistor = createIndexedDbPersistor({
            databaseName,
            indexedDb,
        });
        targetPersistor
            .collection(targetUsers)
            .entry({ tableName: 'collections', primaryKey: 'users' });
        await targetPersistor.hydrate();

        expect(targetUsers.getAll()).toEqual([
            { id: 'u1', name: 'Ada' },
            { id: 'u2', name: 'Grace' },
        ]);
    });

    test('persists and hydrates a collection through the records strategy (one row per entity)', async () => {
        const indexedDb = new IDBFactory();
        const databaseName = 'records-roundtrip-db';

        const persistor = createIndexedDbPersistor({
            databaseName,
            indexedDb,
        });
        const users = new OIMCollection<User, string>();
        persistor.collection(users).records({ tableName: 'users' });

        users.upsertMany([
            { id: 'u1', name: 'Ada' },
            { id: 'u2', name: 'Grace' },
        ]);
        await persistor.persist();

        // Assert one IndexedDB row per entity.
        const rows = await persistor.storage.getAll('users');
        expect(rows).toEqual([
            { primaryKey: 'u1', value: { id: 'u1', name: 'Ada' } },
            { primaryKey: 'u2', value: { id: 'u2', name: 'Grace' } },
        ]);

        const targetUsers = new OIMCollection<User, string>();
        const targetPersistor = createIndexedDbPersistor({
            databaseName,
            indexedDb,
        });
        targetPersistor.collection(targetUsers).records({ tableName: 'users' });
        await targetPersistor.hydrate();

        expect(targetUsers.getAll()).toEqual([
            { id: 'u1', name: 'Ada' },
            { id: 'u2', name: 'Grace' },
        ]);
    });

    test('removal is reflected after re-persist and re-hydrate', async () => {
        const indexedDb = new IDBFactory();
        const databaseName = 'removal-db';

        const persistor = createIndexedDbPersistor({
            databaseName,
            indexedDb,
        });
        const users = new OIMCollection<User, string>();
        persistor.collection(users).records({ tableName: 'users' });

        users.upsertMany([
            { id: 'u1', name: 'Ada' },
            { id: 'u2', name: 'Grace' },
        ]);
        await persistor.persist();

        users.removeOneByPk('u1');
        await persistor.persist();

        const targetUsers = new OIMCollection<User, string>();
        const targetPersistor = createIndexedDbPersistor({
            databaseName,
            indexedDb,
        });
        targetPersistor.collection(targetUsers).records({ tableName: 'users' });
        await targetPersistor.hydrate();

        expect(targetUsers.getAll()).toEqual([{ id: 'u2', name: 'Grace' }]);
    });

    test('object and set index roundtrip through the entry strategy', async () => {
        const indexedDb = new IDBFactory();
        const databaseName = 'object-index-db';

        const persistor = createIndexedDbPersistor({
            databaseName,
            indexedDb,
        });

        const settings = new OIMObject<'theme', string>();
        settings.setProperty('theme', 'dark');

        const users = new OIMCollection<User, string>();
        users.upsertMany([
            { id: 'u1', name: 'Ada' },
            { id: 'u2', name: 'Grace' },
        ]);

        const setIndex = new OIMIndexManualSetBased<string, string>();
        setIndex.setSlots('admin', [
            users.getSlotByPk('u1')!,
            users.getSlotByPk('u2')!,
        ]);

        persistor
            .object(settings)
            .entry({ tableName: 'objects', primaryKey: 'settings' });
        persistor
            .setIndex(setIndex)
            .entry({ tableName: 'indexes', primaryKey: 'set' });
        await persistor.persist();

        const targetPersistor = createIndexedDbPersistor({
            databaseName,
            indexedDb,
        });
        const targetSettings = new OIMObject<'theme', string>();
        const targetSetIndex = new OIMIndexManualSetBased<string, string>();

        targetPersistor
            .object(targetSettings)
            .entry({ tableName: 'objects', primaryKey: 'settings' });
        targetPersistor
            .setIndex(targetSetIndex)
            .entry({ tableName: 'indexes', primaryKey: 'set' });
        await targetPersistor.hydrate();

        expect(targetSettings.getAll()).toEqual({ theme: 'dark' });
        expect(Array.from(targetSetIndex.getPksByKey('admin'))).toEqual([
            'u1',
            'u2',
        ]);
    });

    test('autosave: queue batches mutations, hydrated fresh collection has all rows', async () => {
        const indexedDb = new IDBFactory();
        const databaseName = 'autosave-db';
        const queue = new OIMEventQueue();

        const persistor = createIndexedDbPersistor({
            databaseName,
            indexedDb,
            queue,
        });
        const users = new OIMCollection<User, string>();
        persistor.collection(users).records({ tableName: 'users' });

        persistor.start();
        users.upsertOne({ id: 'u1', name: 'Ada' });
        users.upsertOne({ id: 'u2', name: 'Grace' });

        queue.flush();
        // Poll until the async write settles.
        for (let i = 0; i < 50; i++) {
            await tick();
            const rows = await persistor.storage.getAll('users');
            if (rows.length === 2) break;
        }

        const targetUsers = new OIMCollection<User, string>();
        const targetPersistor = createIndexedDbPersistor({
            databaseName,
            indexedDb,
        });
        targetPersistor.collection(targetUsers).records({ tableName: 'users' });
        await targetPersistor.hydrate();

        expect(targetUsers.getAll()).toEqual([
            { id: 'u1', name: 'Ada' },
            { id: 'u2', name: 'Grace' },
        ]);
        persistor.destroy();
    });

    test('records autosave writes only the changed row (delta), leaving the rest of the table untouched', async () => {
        const indexedDb = new IDBFactory();
        const databaseName = 'records-delta-db';
        const queue = new OIMEventQueue();

        const persistor = createIndexedDbPersistor({
            databaseName,
            indexedDb,
            queue,
        });
        const users = new OIMReactiveCollection<User, string>(queue);
        persistor.collection(users).records({ tableName: 'users' });

        persistor.start();
        users.upsertOne({ id: 'u1', name: 'Ada' });
        users.upsertOne({ id: 'u2', name: 'Grace' });
        queue.flush();
        for (let i = 0; i < 50; i++) {
            await tick();
            if ((await persistor.storage.getAll('users')).length === 2) break;
        }

        // A marker row that a table-wide clear+rewrite would erase. The delta
        // path only touches changed keys, so it must survive.
        await persistor.storage.put('users', '__marker__', {
            id: '__marker__',
            name: 'x',
        });

        users.upsertOne({ id: 'u2', name: 'Grace Hopper' });
        queue.flush();
        for (let i = 0; i < 50; i++) {
            await tick();
            const u2 = (await persistor.storage.getAll('users')).find(
                row => row.primaryKey === 'u2'
            );
            if ((u2?.value as User | undefined)?.name === 'Grace Hopper') break;
        }

        const rows = await persistor.storage.getAll('users');
        const byPk = new Map(rows.map(row => [row.primaryKey, row.value]));
        // Marker survived → the table was not cleared and rewritten.
        expect(byPk.get('__marker__')).toEqual({ id: '__marker__', name: 'x' });
        expect(byPk.get('u2')).toEqual({ id: 'u2', name: 'Grace Hopper' });
        expect(byPk.get('u1')).toEqual({ id: 'u1', name: 'Ada' });
        persistor.destroy();
    });

    test('clearPersisted: hydrating a fresh collection yields nothing', async () => {
        const indexedDb = new IDBFactory();
        const databaseName = 'clear-db';

        const persistor = createIndexedDbPersistor({
            databaseName,
            indexedDb,
        });
        const users = new OIMCollection<User, string>();
        persistor.collection(users).records({ tableName: 'users' });

        users.upsertMany([
            { id: 'u1', name: 'Ada' },
            { id: 'u2', name: 'Grace' },
        ]);
        await persistor.persist();

        await persistor.clearPersisted();

        const targetUsers = new OIMCollection<User, string>();
        const targetPersistor = createIndexedDbPersistor({
            databaseName,
            indexedDb,
        });
        targetPersistor.collection(targetUsers).records({ tableName: 'users' });
        await targetPersistor.hydrate();

        expect(targetUsers.getAll()).toEqual([]);
    });

    test('removeResource stops autosave for that resource', async () => {
        const indexedDb = new IDBFactory();
        const databaseName = 'remove-resource-db';

        const persistor = createIndexedDbPersistor({
            databaseName,
            indexedDb,
        });
        const users = new OIMCollection<User, string>();
        const resource = persistor
            .collection(users)
            .records({ tableName: 'users' });

        persistor.start();
        persistor.removeResource(resource);

        users.upsertOne({ id: 'u1', name: 'Ada' });
        await persistor.persist();

        const targetUsers = new OIMCollection<User, string>();
        const targetPersistor = createIndexedDbPersistor({
            databaseName,
            indexedDb,
        });
        targetPersistor.collection(targetUsers).records({ tableName: 'users' });
        await targetPersistor.hydrate();

        expect(targetUsers.getAll()).toEqual([]);
        persistor.destroy();
    });
});

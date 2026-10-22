import { IDBFactory } from 'fake-indexeddb';
import { OIMPersistIndexedDbBackend } from '../src';

describe('a write batch with nothing in it', () => {
    test('commits without creating the database', async () => {
        const indexedDb = new IDBFactory();
        const persistIndexedDbBackend = new OIMPersistIndexedDbBackend({ databaseName: 'never-opened-db', indexedDb });

        await persistIndexedDbBackend.createWriteBatch().commit();

        expect(await indexedDb.databases()).toEqual([]);
    });

    test('commits without opening a connection that would block an upgrade elsewhere', async () => {
        const indexedDb = new IDBFactory();
        const persistIndexedDbBackend = new OIMPersistIndexedDbBackend({ databaseName: 'idle-db', indexedDb });
        const seedingWriteBatch = persistIndexedDbBackend.createWriteBatch();
        seedingWriteBatch.putTableValue('entries', 'k1', 1);
        await seedingWriteBatch.commit();
        const openSpy = jest.spyOn(indexedDb, 'open');

        await persistIndexedDbBackend.createWriteBatch().commit();

        expect(openSpy).not.toHaveBeenCalled();
    });
});

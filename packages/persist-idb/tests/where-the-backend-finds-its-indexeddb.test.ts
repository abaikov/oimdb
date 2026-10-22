import { IDBFactory } from 'fake-indexeddb';
import { OIMPersistIndexedDbBackend } from '../src';

type TGlobalWithIndexedDb = { indexedDB?: IDBFactory };

describe('where the IndexedDB backend finds its IndexedDB', () => {
    const globalWithIndexedDb = globalThis as TGlobalWithIndexedDb;
    const ownIndexedDbDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');

    afterEach(() => {
        if (ownIndexedDbDescriptor === undefined) delete globalWithIndexedDb.indexedDB;
        else Object.defineProperty(globalThis, 'indexedDB', ownIndexedDbDescriptor);
    });

    test('with no indexedDb passed, it writes into globalThis.indexedDB', async () => {
        const globalIndexedDb = new IDBFactory();
        globalWithIndexedDb.indexedDB = globalIndexedDb;

        const persistIndexedDbWriteBatch = new OIMPersistIndexedDbBackend({ databaseName: 'global-db' }).createWriteBatch();
        persistIndexedDbWriteBatch.putTableValue('entries', 'k1', { n: 1 });
        await persistIndexedDbWriteBatch.commit();

        const readThroughGlobal = new OIMPersistIndexedDbBackend({ databaseName: 'global-db', indexedDb: globalIndexedDb });
        expect(await readThroughGlobal.readTableValue('entries', 'k1')).toEqual({ n: 1 });
    });

    test('with no indexedDb passed and no globalThis.indexedDB, construction throws and names the option to pass', () => {
        delete globalWithIndexedDb.indexedDB;

        expect(() => new OIMPersistIndexedDbBackend({ databaseName: 'absent-db' })).toThrow(
            'OIMPersistIndexedDbBackend: globalThis.indexedDB is not available in this environment. Pass indexedDb, '
            + 'for example fake-indexeddb in a test.',
        );
    });

    test('an indexedDb passed in wins over globalThis.indexedDB, which gets no database', async () => {
        const globalIndexedDb = new IDBFactory();
        globalWithIndexedDb.indexedDB = globalIndexedDb;
        const indexedDb = new IDBFactory();

        const persistIndexedDbWriteBatch = new OIMPersistIndexedDbBackend({ databaseName: 'own-db', indexedDb }).createWriteBatch();
        persistIndexedDbWriteBatch.putTableValue('entries', 'k1', { n: 1 });
        await persistIndexedDbWriteBatch.commit();

        expect((await indexedDb.databases()).map(databaseInfo => databaseInfo.name)).toEqual(['own-db']);
        expect(await globalIndexedDb.databases()).toEqual([]);
    });
});

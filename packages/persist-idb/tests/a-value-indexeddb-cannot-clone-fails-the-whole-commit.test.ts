import { IDBFactory } from 'fake-indexeddb';
import { OIMPersistIndexedDbBackend } from '../src';

async function createSeededBackend(databaseName: string): Promise<OIMPersistIndexedDbBackend> {
    const persistIndexedDbBackend = new OIMPersistIndexedDbBackend({ databaseName, indexedDb: new IDBFactory() });
    const persistIndexedDbWriteBatch = persistIndexedDbBackend.createWriteBatch();
    persistIndexedDbWriteBatch.putTableValue('entries', 'k1', { n: 1 });
    await persistIndexedDbWriteBatch.commit();
    return persistIndexedDbBackend;
}

describe('a write batch holding a value IndexedDB cannot clone', () => {
    test('rejects the commit with the clone error itself', async () => {
        const persistIndexedDbBackend = await createSeededBackend('uncloneable-error-db');
        const persistIndexedDbWriteBatch = persistIndexedDbBackend.createWriteBatch();
        persistIndexedDbWriteBatch.putTableValue('entries', 'k2', { render: () => 'not cloneable' });

        await expect(persistIndexedDbWriteBatch.commit()).rejects.toMatchObject({ name: 'DataCloneError' });
    });

    test('applies none of the batch, the changes before the bad value included', async () => {
        const persistIndexedDbBackend = await createSeededBackend('uncloneable-atomic-db');
        const persistIndexedDbWriteBatch = persistIndexedDbBackend.createWriteBatch();
        persistIndexedDbWriteBatch.putTableValue('entries', 'k1', { n: 2 });
        persistIndexedDbWriteBatch.putTableValue('entries', 'k3', { n: 3 });
        persistIndexedDbWriteBatch.putTableValue('entries', 'k2', { render: () => 'not cloneable' });

        await expect(persistIndexedDbWriteBatch.commit()).rejects.toBeDefined();

        expect(await persistIndexedDbBackend.readAllTableRecords('entries')).toEqual([{ key: 'k1', value: { n: 1 } }]);
    });
});

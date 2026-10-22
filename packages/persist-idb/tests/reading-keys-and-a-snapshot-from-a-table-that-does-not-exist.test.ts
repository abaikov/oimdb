import { IDBFactory } from 'fake-indexeddb';
import { OIMPersistIndexedDbBackend, OIMPersistIndexedDbRecordsStrategy, OIMPersistIndexedDbSnapshotStrategy } from '../src';

type TCard = { id: string; title: string };

async function createBackendWithOneTable(databaseName: string): Promise<OIMPersistIndexedDbBackend> {
    const persistIndexedDbBackend = new OIMPersistIndexedDbBackend({ databaseName, indexedDb: new IDBFactory() });
    const persistIndexedDbWriteBatch = persistIndexedDbBackend.createWriteBatch();
    persistIndexedDbWriteBatch.putTableValue('cards', 'c1', { id: 'c1', title: 'alpha' });
    await persistIndexedDbWriteBatch.commit();
    return persistIndexedDbBackend;
}

describe('reading from a table that was never written', () => {
    test('answers undefined for every key asked, in the order asked', async () => {
        const persistIndexedDbBackend = await createBackendWithOneTable('missing-values-db');

        expect(await persistIndexedDbBackend.readTableValues('decks', ['d1', 'd2', 'd3'])).toEqual([undefined, undefined, undefined]);
    });

    test('a records strategy loads no record for the keys asked', async () => {
        const persistIndexedDbBackend = await createBackendWithOneTable('missing-records-db');
        const persistIndexedDbRecordsStrategy = new OIMPersistIndexedDbRecordsStrategy<string, TCard>({ tableName: 'decks' });

        expect(await persistIndexedDbRecordsStrategy.readRecordsOfKeys(persistIndexedDbBackend, ['d1', 'd2'])).toEqual({ records: [] });
    });

    test('a snapshot strategy reads no snapshot', async () => {
        const persistIndexedDbBackend = await createBackendWithOneTable('missing-snapshot-db');
        const persistIndexedDbSnapshotStrategy = new OIMPersistIndexedDbSnapshotStrategy<TCard>({ tableName: 'settings', primaryKey: 'app' });

        expect(await persistIndexedDbSnapshotStrategy.readSnapshot(persistIndexedDbBackend)).toBeUndefined();
    });

    test('a read of keys that are missing from a table that exists answers undefined only for those', async () => {
        const persistIndexedDbBackend = await createBackendWithOneTable('partly-missing-db');
        const persistIndexedDbRecordsStrategy = new OIMPersistIndexedDbRecordsStrategy<string, TCard>({ tableName: 'cards' });

        expect(await persistIndexedDbBackend.readTableValues('cards', ['c0', 'c1'])).toEqual([undefined, { id: 'c1', title: 'alpha' }]);
        expect(await persistIndexedDbRecordsStrategy.readRecordsOfKeys(persistIndexedDbBackend, ['c0', 'c1'])).toEqual({
            records: [{ key: 'c1', entity: { id: 'c1', title: 'alpha' } }],
        });
    });

    test('none of these reads creates the table it was asked about', async () => {
        const persistIndexedDbBackend = await createBackendWithOneTable('reads-create-nothing-db');
        await persistIndexedDbBackend.readTableValues('decks', ['d1']);
        await persistIndexedDbBackend.readTableValue('settings', 'app');

        expect(await persistIndexedDbBackend.readAllTableRecords('decks')).toBeUndefined();
        expect(await persistIndexedDbBackend.readAllTableRecords('settings')).toBeUndefined();
    });
});

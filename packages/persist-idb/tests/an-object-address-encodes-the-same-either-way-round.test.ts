import { IDBFactory } from 'fake-indexeddb';
import type { TOIMPersistIndexedDbPrimaryKey } from '../src';
import { OIMPersistIndexedDbBackend } from '../src';

function createIndexedDbPersistBackend(databaseName: string): OIMPersistIndexedDbBackend {
    return new OIMPersistIndexedDbBackend({ databaseName, indexedDb: new IDBFactory() });
}

async function putTableValue(
    persistIndexedDbBackend: OIMPersistIndexedDbBackend,
    primaryKey: TOIMPersistIndexedDbPrimaryKey,
    value: unknown,
): Promise<void> {
    const persistIndexedDbWriteBatch = persistIndexedDbBackend.createWriteBatch();
    persistIndexedDbWriteBatch.putTableValue('entries', primaryKey, value);
    await persistIndexedDbWriteBatch.commit();
}

describe('an object primary key', () => {
    test('names one table value whatever order its properties were assembled in', async () => {
        const persistIndexedDbBackend = createIndexedDbPersistBackend('object-address-order-db');

        await putTableValue(persistIndexedDbBackend, { tenant: 't1', scope: 's1' }, { n: 1 });

        expect(await persistIndexedDbBackend.readTableValue('entries', { scope: 's1', tenant: 't1' })).toEqual({ n: 1 });

        await putTableValue(persistIndexedDbBackend, { scope: 's1', tenant: 't1' }, { n: 2 });
        const persistIndexedDbTableRecords = (await persistIndexedDbBackend.readAllTableRecords('entries')) ?? [];
        expect(persistIndexedDbTableRecords).toHaveLength(1);
        expect(persistIndexedDbTableRecords[0].value).toEqual({ n: 2 });
    });

    test('is order-independent at every depth, not just the top level', async () => {
        const persistIndexedDbBackend = createIndexedDbPersistBackend('object-address-nested-db');

        await putTableValue(persistIndexedDbBackend, { outer: { a: 1, b: 2 } }, 'nested');

        expect(await persistIndexedDbBackend.readTableValue('entries', { outer: { b: 2, a: 1 } })).toBe('nested');
        expect(await persistIndexedDbBackend.readAllTableRecords('entries')).toHaveLength(1);
    });

    test('does not share a table value with a string key that reads like its encoding', async () => {
        const persistIndexedDbBackend = createIndexedDbPersistBackend('object-address-collision-db');

        await putTableValue(persistIndexedDbBackend, '{"a":1}', 'chosen by the caller');
        await putTableValue(persistIndexedDbBackend, { a: 1 }, 'encoded from an object');

        expect(await persistIndexedDbBackend.readTableValue('entries', '{"a":1}')).toBe('chosen by the caller');
        expect(await persistIndexedDbBackend.readTableValue('entries', { a: 1 })).toBe('encoded from an object');
        expect(await persistIndexedDbBackend.readAllTableRecords('entries')).toHaveLength(2);
    });

    test('deletes the same table value it put, whatever order the delete spells it in', async () => {
        const persistIndexedDbBackend = createIndexedDbPersistBackend('object-address-delete-db');
        await putTableValue(persistIndexedDbBackend, { tenant: 't1', scope: 's1' }, { n: 1 });

        const persistIndexedDbWriteBatch = persistIndexedDbBackend.createWriteBatch();
        persistIndexedDbWriteBatch.deleteTableValue('entries', { scope: 's1', tenant: 't1' });
        await persistIndexedDbWriteBatch.commit();

        expect(await persistIndexedDbBackend.readAllTableRecords('entries')).toEqual([]);
    });
});

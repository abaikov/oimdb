import { IDBFactory } from 'fake-indexeddb';
import type { TOIMPersistIndexedDbPrimaryKey } from '../src';
import { OIMPersistIndexedDbBackend } from '../src';

function createIndexedDbPersistBackend(databaseName: string): OIMPersistIndexedDbBackend {
    return new OIMPersistIndexedDbBackend({ databaseName, indexedDb: new IDBFactory() });
}

async function putTableValue(
    persistIndexedDbBackend: OIMPersistIndexedDbBackend, primaryKey: TOIMPersistIndexedDbPrimaryKey, value: unknown,
): Promise<void> {
    const persistIndexedDbWriteBatch = persistIndexedDbBackend.createWriteBatch();
    persistIndexedDbWriteBatch.putTableValue('entries', primaryKey, value);
    await persistIndexedDbWriteBatch.commit();
}

describe('an object primary key', () => {
    test('built with no prototype names the same table value as the plain record with the same properties', async () => {
        const persistIndexedDbBackend = createIndexedDbPersistBackend('null-prototype-address-db');
        const nullPrototypeKey = Object.assign(Object.create(null) as Record<string, unknown>, { tenant: 't1', scope: 's1' });

        await putTableValue(persistIndexedDbBackend, nullPrototypeKey, 'from a null-prototype key');

        expect(await persistIndexedDbBackend.readTableValue('entries', { scope: 's1', tenant: 't1' })).toBe('from a null-prototype key');
        expect(await persistIndexedDbBackend.readAllTableRecords('entries')).toHaveLength(1);
    });

    test('holding the same object twice is encoded with both parts, and found again', async () => {
        const persistIndexedDbBackend = createIndexedDbPersistBackend('repeated-part-address-db');
        const sharedPart = { b: 2, a: 1 };

        await putTableValue(persistIndexedDbBackend, { left: sharedPart, right: sharedPart }, 'shared');

        expect(await persistIndexedDbBackend.readTableValue('entries', { right: { a: 1, b: 2 }, left: { a: 1, b: 2 } })).toBe('shared');
        expect(await persistIndexedDbBackend.readTableValue('entries', { left: { a: 1, b: 2 } })).toBeUndefined();
    });

    test('holding an array keeps the order of the array, and sorts the records inside it', async () => {
        const persistIndexedDbBackend = createIndexedDbPersistBackend('array-part-address-db');

        await putTableValue(persistIndexedDbBackend, { path: [{ y: 2, x: 1 }, 'tail'] }, 'listed');

        expect(await persistIndexedDbBackend.readTableValue('entries', { path: [{ x: 1, y: 2 }, 'tail'] })).toBe('listed');
        expect(await persistIndexedDbBackend.readTableValue('entries', { path: ['tail', { x: 1, y: 2 }] })).toBeUndefined();
    });

    test('that is not a record, such as an array or a date, is handed to IndexedDB as it is', async () => {
        const persistIndexedDbBackend = createIndexedDbPersistBackend('native-key-db');
        const dateKey = new Date(Date.UTC(2026, 9, 22));

        await putTableValue(persistIndexedDbBackend, ['deck', 1], 'array key');
        await putTableValue(persistIndexedDbBackend, dateKey, 'date key');

        expect((await persistIndexedDbBackend.readAllTableRecords('entries'))?.map(record => record.key)).toEqual([dateKey, ['deck', 1]]);
    });
});

import { IDBDatabase, IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import type { TOIMStoreKey } from '@oimdb/core';
import { OIMDB, createOIMInPlaceEntityWriter } from '@oimdb/core';
import type { TOIMPersistOperation } from '@oimdb/persist';
import {
    OIMPersistEntityWriter,
    OIMPersistCollectionChangeWriteRecordSource,
    OIMPersistRecordsResource,
    OIMPersistMicrotaskScheduler,
    OIMPersistor,
} from '@oimdb/persist';
import type { OIMPersistIndexedDbWriteBatch } from '../src';
import { OIMPersistIndexedDbBackend, OIMPersistIndexedDbRecordsService } from '../src';
import { createOIMEntityContentService } from '@oimdb/core';
import { createOIMSlotCollectionService } from '@oimdb/core';

type TUser = { id: string; name: string; onGreet?: () => string };

function buildPersistedUsers(databaseName: string) {
    const persistEntityWriter = new OIMPersistEntityWriter<TUser, TOIMStoreKey>({
        entityWriter: createOIMInPlaceEntityWriter(),
    });
    const db = new OIMDB();
    const entityService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TUser>({ entityWriter: persistEntityWriter }) });
    const entityStoreSlot = entityService.createStoreSlot(db);
    const persistIndexedDbBackend = new OIMPersistIndexedDbBackend({ databaseName, indexedDb: new IDBFactory() });
    const persistOperations: TOIMPersistOperation[] = [];
    const persistor = new OIMPersistor<OIMPersistIndexedDbBackend, OIMPersistIndexedDbWriteBatch>({
        persistBackend: persistIndexedDbBackend,
        persistScheduler: new OIMPersistMicrotaskScheduler(),
        onPersistError: (_error, persistErrorContext) => persistOperations.push(persistErrorContext.persistOperation),
    });
    const persistRecordsResource = persistor.addPersistResource(new OIMPersistRecordsResource<
        OIMPersistIndexedDbBackend, OIMPersistIndexedDbWriteBatch, TOIMStoreKey, TUser
    >({
        persistRecordSource: new OIMPersistCollectionChangeWriteRecordSource<TOIMStoreKey, TUser>({
            entityCollectionService: entityService, entityStoreSlot,
            persistEntityWriter,
        }),
        persistRecordsService: new OIMPersistIndexedDbRecordsService<TOIMStoreKey, TUser>({ tableName: 'users' }),
    }));
    return { entityService, entityStoreSlot, persistIndexedDbBackend, persistor, persistRecordsResource, persistOperations };
}

describe('persistor.unload on an IndexedDB records resource', () => {
    let transactionSpy: jest.SpyInstance;
    const startedPersistors: Array<{ destroy(): void }> = [];

    beforeEach(() => {
        transactionSpy = jest.spyOn(IDBDatabase.prototype, 'transaction');
    });
    afterEach(() => {
        for (const persistor of startedPersistors.splice(0)) persistor.destroy();
        transactionSpy.mockRestore();
    });

    const readwriteTransactionCount = (): number =>
        transactionSpy.mock.calls.filter(transactionCall => transactionCall[1] === 'readwrite').length;
    const readonlyTransactionCount = (): number =>
        transactionSpy.mock.calls.filter(transactionCall => transactionCall[1] === 'readonly').length;

    test('writes the pending delta in one readwrite transaction, and the unloaded key stays on the backend', async () => {
        const { entityService, entityStoreSlot, persistIndexedDbBackend, persistor, persistRecordsResource } =
            buildPersistedUsers('unload-one-transaction-db');
        startedPersistors.push(persistor);
        persistor.start();
        entityService.writeInBatch(entityStoreSlot, () => ([{ id: 'u1', name: 'Ada' }, { id: 'u2', name: 'Grace' }]).map(entity => entityService.writeSlotContentByKey(entityStoreSlot, entity.id, entity)));
        await Promise.resolve();
        await persistor.whenIdle();
        transactionSpy.mockClear();

        entityService.writeSlotContentByKey(entityStoreSlot, 'u2', { id: 'u2', name: 'Grace Hopper' });
        entityService.writeSlotContentByKey(entityStoreSlot, 'u3', { id: 'u3', name: 'Edsger' });
        await persistor.unload(persistRecordsResource, ['u1']);
        await Promise.resolve();
        await persistor.whenIdle();

        expect(readwriteTransactionCount()).toBe(1);
        expect(entityService.peekSlotByKey(entityStoreSlot,'u1')?.entity).toBeUndefined();
        expect(await persistIndexedDbBackend.readAllTableRecords('users')).toEqual([
            { key: 'u1', value: { id: 'u1', name: 'Ada' } },
            { key: 'u2', value: { id: 'u2', name: 'Grace Hopper' } },
            { key: 'u3', value: { id: 'u3', name: 'Edsger' } },
        ]);
    });

    test('an unload with nothing pending writes the unloaded keys as they are, in one readwrite transaction', async () => {
        const { entityService, entityStoreSlot, persistIndexedDbBackend, persistor, persistRecordsResource } =
            buildPersistedUsers('unload-nothing-pending-db');
        startedPersistors.push(persistor);
        persistor.start();
        entityService.writeInBatch(entityStoreSlot, () => ([{ id: 'u1', name: 'Ada' }, { id: 'u2', name: 'Grace' }]).map(entity => entityService.writeSlotContentByKey(entityStoreSlot, entity.id, entity)));
        await Promise.resolve();
        await persistor.whenIdle();
        transactionSpy.mockClear();

        await persistor.unload(persistRecordsResource, ['u1', 'u2']);
        await Promise.resolve();
        await persistor.whenIdle();

        expect(readwriteTransactionCount()).toBe(1);
        expect(entityService.peekSlotByKey(entityStoreSlot,'u1')?.entity).toBeUndefined();
        expect(await persistIndexedDbBackend.readAllTableRecords('users')).toEqual([
            { key: 'u1', value: { id: 'u1', name: 'Ada' } },
            { key: 'u2', value: { id: 'u2', name: 'Grace' } },
        ]);
    });

    test('a commit that fails leaves the table exactly as it was, and keeps the key in memory', async () => {
        const { entityService, entityStoreSlot, persistIndexedDbBackend, persistor, persistRecordsResource, persistOperations } =
            buildPersistedUsers('unload-failed-commit-db');
        startedPersistors.push(persistor);
        persistor.start();
        entityService.writeSlotContentByKey(entityStoreSlot, 'u1', { id: 'u1', name: 'Ada' });
        await Promise.resolve();
        await persistor.whenIdle();

        entityService.writeSlotContentByKey(entityStoreSlot, 'u1', { id: 'u1', name: 'Ada Lovelace' });
        entityService.writeSlotContentByKey(entityStoreSlot, 'u2', { id: 'u2', name: 'Grace', onGreet: () => 'hello' });
        const unloadRejection: unknown = await persistor.unload(persistRecordsResource, ['u1']).then(
            () => undefined,
            (error: unknown) => error,
        );

        expect(unloadRejection).not.toBeNull();
        expect(unloadRejection).not.toBeUndefined();
        expect(unloadRejection).toMatchObject({ name: 'DataCloneError', message: expect.any(String) });
        expect(persistOperations).toEqual([]);
        expect(entityService.peekSlotByKey(entityStoreSlot,'u1')?.entity).toEqual({ id: 'u1', name: 'Ada Lovelace' });
        expect(await persistIndexedDbBackend.readAllTableRecords('users')).toEqual([
            { key: 'u1', value: { id: 'u1', name: 'Ada' } },
        ]);
    });

    test('a load reads only the requested keys in one readonly transaction and puts them back into memory', async () => {
        const { entityService, entityStoreSlot, persistIndexedDbBackend, persistor, persistRecordsResource } =
            buildPersistedUsers('load-requested-keys-db');
        startedPersistors.push(persistor);
        persistor.start();
        entityService.writeInBatch(entityStoreSlot, () => ([
            { id: 'u1', name: 'Ada' }, { id: 'u2', name: 'Grace' }, { id: 'u3', name: 'Edsger' },
        ]).map(entity => entityService.writeSlotContentByKey(entityStoreSlot, entity.id, entity)));
        await Promise.resolve();
        await persistor.whenIdle();
        await persistor.unload(persistRecordsResource, ['u1', 'u2']);
        await Promise.resolve();
        await persistor.whenIdle();
        transactionSpy.mockClear();
        const objectStoreGetSpy = jest.spyOn(IDBObjectStore.prototype, 'get');

        try {
            await persistor.load(persistRecordsResource, ['u1']);
            await Promise.resolve();
            await persistor.whenIdle();

            expect(readonlyTransactionCount()).toBe(1);
            expect(readwriteTransactionCount()).toBe(0);
            expect(objectStoreGetSpy.mock.calls.map(getCall => getCall[0])).toEqual(['u1']);
        } finally {
            objectStoreGetSpy.mockRestore();
        }
        expect(entityService.peekSlotByKey(entityStoreSlot,'u1')?.entity).toEqual({ id: 'u1', name: 'Ada' });
        expect(entityService.peekSlotByKey(entityStoreSlot,'u2')?.entity).toBeUndefined();
        expect(await persistIndexedDbBackend.readAllTableRecords('users')).toEqual([
            { key: 'u1', value: { id: 'u1', name: 'Ada' } },
            { key: 'u2', value: { id: 'u2', name: 'Grace' } },
            { key: 'u3', value: { id: 'u3', name: 'Edsger' } },
        ]);
    });
});

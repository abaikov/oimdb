import { IDBFactory } from 'fake-indexeddb';
import type { TOIMStoreKey } from '@oimdb/core';
import {
    OIMDB,
    createOIMEntityService,
    createOIMEntityWriterInPlace,
} from '@oimdb/core';
import {
    OIMPersistEntityWriter,
    OIMPersistRecordSourceCollectionChangeDriven,
    OIMPersistResourceRecords,
    OIMPersistSchedulerMicrotaskDriven,
    OIMPersistor,
} from '@oimdb/persist';
import type { OIMPersistIndexedDbWriteBatch } from '../src';
import { OIMPersistIndexedDbBackend, OIMPersistIndexedDbRecordsStrategy } from '../src';
import { oimOpenIndexedDb } from '../src/utils/oimOpenIndexedDb';

type TUser = { id: string; name: string };
type TIndexedDbPersistor = OIMPersistor<OIMPersistIndexedDbBackend, OIMPersistIndexedDbWriteBatch>;

function tick(): Promise<void> {
    return new Promise(resolve => {
        setTimeout(resolve, 0);
    });
}

async function waitUntil(isSettled: () => Promise<boolean>): Promise<void> {
    for (let i = 0; i < 50; i++) {
        if (await isSettled()) return;
        await tick();
    }
}

describe('an upgrade blocked by another open connection', () => {
    const startedPersistors: TIndexedDbPersistor[] = [];
    const blockingDatabases: IDBDatabase[] = [];
    afterEach(() => {
        for (const persistor of startedPersistors.splice(0)) persistor.destroy();
        for (const blockingDatabase of blockingDatabases.splice(0)) blockingDatabase.close();
    });

    test('waits the block out and writes, instead of dropping the change', async () => {
        const indexedDb = new IDBFactory();
        const databaseName = 'blocked-upgrade-db';
        const blockingDatabase = await oimOpenIndexedDb({ indexedDb, databaseName });
        blockingDatabases.push(blockingDatabase);

        const persistEntityWriter = new OIMPersistEntityWriter<TUser, TOIMStoreKey>({
            entityWriter: createOIMEntityWriterInPlace(),
        });
        const db = new OIMDB();
        const entityService = createOIMEntityService<TUser>(db, {
            keyOf: user => user.id,
            entityWriter: persistEntityWriter,
        });
        const entityStoreSlot = entityService.createStoreSlot(db);
        const persistIndexedDbBackend = new OIMPersistIndexedDbBackend({ databaseName, indexedDb });
        const errors: unknown[] = [];
        const persistor = new OIMPersistor<OIMPersistIndexedDbBackend, OIMPersistIndexedDbWriteBatch>({
            persistBackend: persistIndexedDbBackend,
            persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
            onPersistError: error => errors.push(error),
        });
        persistor.addPersistResource(new OIMPersistResourceRecords<
            OIMPersistIndexedDbBackend, OIMPersistIndexedDbWriteBatch, TOIMStoreKey, TUser
        >({
            persistRecordSource: new OIMPersistRecordSourceCollectionChangeDriven<TOIMStoreKey, TUser>({
                entityCollectionService: entityService,
                entityStoreSlot,
                persistEntityWriter,
            }),
            persistRecordsStrategy: new OIMPersistIndexedDbRecordsStrategy<TOIMStoreKey, TUser>({ tableName: 'users' }),
        }));
        startedPersistors.push(persistor);
        persistor.start();

        entityService.slotContentService.upsertEntity(entityStoreSlot, { id: 'u1', name: 'Ada' });
        for (let i = 0; i < 10; i++) await tick();

        expect(errors).toEqual([]);

        blockingDatabase.close();

        await waitUntil(async () => ((await persistIndexedDbBackend.readAllTableRecords('users')) ?? []).length === 1);

        expect(await persistIndexedDbBackend.readAllTableRecords('users')).toEqual([
            { key: 'u1', value: { id: 'u1', name: 'Ada' } },
        ]);
        expect(errors).toEqual([]);
    });
});

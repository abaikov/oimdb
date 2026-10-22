import type { TOIMStoreKey } from '@oimdb/core';
import {
    OIMDB,
    createOIMEntityService,
    createOIMEntityWriterInPlace,
} from '@oimdb/core';
import type {
    OIMPersistKeyValueBackend,
    OIMPersistKeyValueWriteBatch,
    TOIMPersistKeyValueItemStorage,
    TOIMPersistOperation,
    TOIMPersistRecords,
} from '@oimdb/persist';
import {
    OIMPersistCodecIdentity,
    OIMPersistEntityWriter,
    OIMPersistKeyValueEntryStrategy,
    OIMPersistRecordSourceCollectionChangeDriven,
    OIMPersistResourceSnapshot,
    OIMPersistSchedulerMicrotaskDriven,
    OIMPersistor,
} from '@oimdb/persist';
import { OIMPersistLocalStorageBackend } from '../src';

type TNode = { id: string; self?: unknown };
type TNodeRecords = TOIMPersistRecords<TOIMStoreKey, TNode>;
type TLocalStoragePersistor = OIMPersistor<OIMPersistKeyValueBackend, OIMPersistKeyValueWriteBatch>;

function createPersistKeyValueItemStorage(): TOIMPersistKeyValueItemStorage {
    const itemByStorageKey = new Map<string, string>();
    return {
        getItem: storageKey => itemByStorageKey.get(storageKey) ?? null,
        setItem: (storageKey, item) => {
            itemByStorageKey.set(storageKey, item);
        },
        removeItem: storageKey => {
            itemByStorageKey.delete(storageKey);
        },
    };
}

function buildNodes(db: OIMDB, storageKey: string) {
    const persistEntityWriter = new OIMPersistEntityWriter<TNode, TOIMStoreKey>({
        entityWriter: createOIMEntityWriterInPlace(),
    });
    const entityService = createOIMEntityService<TNode>(db, {
        keyOf: node => node.id,
        entityWriter: persistEntityWriter,
    });
    const entityStoreSlot = entityService.createStoreSlot(db);
    const persistResourceSnapshot = new OIMPersistResourceSnapshot<
        OIMPersistKeyValueBackend, OIMPersistKeyValueWriteBatch, TNodeRecords, TNodeRecords
    >({
        persistSnapshotSource: new OIMPersistRecordSourceCollectionChangeDriven<TOIMStoreKey, TNode>({
            entityCollectionService: entityService,
            entityStoreSlot,
            persistEntityWriter,
        }),
        persistSnapshotStrategy: new OIMPersistKeyValueEntryStrategy<TNodeRecords>({ storageKey }),
        persistCodec: new OIMPersistCodecIdentity<TNodeRecords>(),
    });
    return { entityService, entityStoreSlot, persistResourceSnapshot };
}

async function settleAutosave(persistor: TLocalStoragePersistor): Promise<void> {
    await Promise.resolve();
    await persistor.whenIdle();
}

describe('a write batch holding one value the serializer refuses', () => {
    it('writes the resources that are not the problem', async () => {
        const persistKeyValueItemStorage = createPersistKeyValueItemStorage();
        const db = new OIMDB();
        const poisonedNodes = buildNodes(db, 'poisoned');
        const healthyNodes = buildNodes(db, 'healthy');
        const persistor = new OIMPersistor<OIMPersistKeyValueBackend, OIMPersistKeyValueWriteBatch>({
            persistBackend: new OIMPersistLocalStorageBackend({ persistKeyValueItemStorage }),
            persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
        });
        persistor.addPersistResource(poisonedNodes.persistResourceSnapshot);
        persistor.addPersistResource(healthyNodes.persistResourceSnapshot);
        persistor.start();

        const cycle: TNode = { id: 'p1' };
        cycle.self = cycle;
        poisonedNodes.entityService.slotContentService.upsertEntity(poisonedNodes.entityStoreSlot,cycle);
        healthyNodes.entityService.slotContentService.upsertEntity(healthyNodes.entityStoreSlot,{ id: 'h1' });
        await settleAutosave(persistor);

        expect(persistKeyValueItemStorage.getItem('healthy')).toBe('{"records":[{"key":"h1","entity":{"id":"h1"}}]}');
        expect(persistKeyValueItemStorage.getItem('poisoned')).toBeNull();

        persistor.destroy();
    });

    it('stops re-serialising the value that will never serialise, and says so once', async () => {
        const persistKeyValueItemStorage = createPersistKeyValueItemStorage();
        const db = new OIMDB();
        const poisonedNodes = buildNodes(db, 'poisoned');
        const persistOperations: TOIMPersistOperation[] = [];
        const persistor = new OIMPersistor<OIMPersistKeyValueBackend, OIMPersistKeyValueWriteBatch>({
            persistBackend: new OIMPersistLocalStorageBackend({ persistKeyValueItemStorage }),
            persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
            onPersistError: (_error, persistErrorContext) => persistOperations.push(persistErrorContext.persistOperation),
        });
        persistor.addPersistResource(poisonedNodes.persistResourceSnapshot);
        persistor.start();

        const cycle: TNode = { id: 'p1' };
        cycle.self = cycle;
        poisonedNodes.entityService.slotContentService.upsertEntity(poisonedNodes.entityStoreSlot,cycle);
        for (let i = 0; i < 6; i++) {
            poisonedNodes.entityService.slotContentService.upsertEntity(poisonedNodes.entityStoreSlot,{ id: `n${i}`, self: cycle });
            await settleAutosave(persistor);
        }

        expect(persistOperations).toEqual(['persist', 'persist', 'quarantine']);
        expect(persistKeyValueItemStorage.getItem('poisoned')).toBeNull();

        persistor.destroy();
    });

    it('lifts the quarantine on a successful manual persist', async () => {
        const persistKeyValueItemStorage = createPersistKeyValueItemStorage();
        const db = new OIMDB();
        const poisonedNodes = buildNodes(db, 'poisoned');
        const persistOperations: TOIMPersistOperation[] = [];
        const persistor = new OIMPersistor<OIMPersistKeyValueBackend, OIMPersistKeyValueWriteBatch>({
            persistBackend: new OIMPersistLocalStorageBackend({ persistKeyValueItemStorage }),
            persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
            onPersistError: (_error, persistErrorContext) => persistOperations.push(persistErrorContext.persistOperation),
        });
        persistor.addPersistResource(poisonedNodes.persistResourceSnapshot);
        persistor.start();

        const cycle: TNode = { id: 'p1' };
        cycle.self = cycle;
        for (let i = 0; i < 3; i++) {
            poisonedNodes.entityService.slotContentService.upsertEntity(poisonedNodes.entityStoreSlot,{ id: `n${i}`, self: cycle });
            await settleAutosave(persistor);
        }
        expect(persistOperations).toEqual(['persist', 'persist', 'quarantine']);

        for (let i = 0; i < 3; i++) poisonedNodes.entityService.slotContentService.upsertEntity(poisonedNodes.entityStoreSlot,{ id: `n${i}` });
        await persistor.persist();
        poisonedNodes.entityService.slotContentService.upsertEntity(poisonedNodes.entityStoreSlot,{ id: 'n3' });
        await settleAutosave(persistor);

        expect(persistOperations).toEqual(['persist', 'persist', 'quarantine']);
        expect(JSON.parse(persistKeyValueItemStorage.getItem('poisoned') as string)).toEqual({
            records: [
                { key: 'n0', entity: { id: 'n0' } },
                { key: 'n1', entity: { id: 'n1' } },
                { key: 'n2', entity: { id: 'n2' } },
                { key: 'n3', entity: { id: 'n3' } },
            ],
        });

        persistor.destroy();
    });
});

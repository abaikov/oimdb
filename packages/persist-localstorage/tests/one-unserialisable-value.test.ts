import type { TOIMStoreKey } from '@oimdb/core';
import { OIMDB, createOIMInPlaceEntityWriter } from '@oimdb/core';
import type {
    OIMPersistKeyValueBackend,
    OIMPersistKeyValueWriteBatch,
    TOIMPersistKeyValueItemStorage,
    TOIMPersistOperation,
    TOIMPersistRecords,
} from '@oimdb/persist';
import {
    OIMPersistIdentityCodec,
    OIMPersistEntityWriter,
    OIMPersistKeyValueEntrySnapshotService,
    OIMPersistCollectionChangeWriteRecordSource,
    OIMPersistSnapshotResource,
    OIMPersistMicrotaskScheduler,
    OIMPersistor,
} from '@oimdb/persist';
import { OIMPersistLocalStorageKeyValueBackend } from '../src';
import { createOIMSlotContentEntityService } from '@oimdb/core';
import { createOIMSlotCollectionService } from '@oimdb/core';

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
        entityWriter: createOIMInPlaceEntityWriter(),
    });
    const entityService = createOIMSlotCollectionService({ slotContentService: createOIMSlotContentEntityService<TNode>({ entityWriter: persistEntityWriter }) });
    const entityStoreSlot = entityService.createStoreSlot(db);
    const persistSnapshotResource = new OIMPersistSnapshotResource<
        OIMPersistKeyValueBackend, OIMPersistKeyValueWriteBatch, TNodeRecords, TNodeRecords
    >({
        persistSnapshotSource: new OIMPersistCollectionChangeWriteRecordSource<TOIMStoreKey, TNode>({
            entityCollectionService: entityService,
            entityStoreSlot,
            persistEntityWriter,
        }),
        persistSnapshotService: new OIMPersistKeyValueEntrySnapshotService<TNodeRecords>({ storageKey }),
        persistCodec: new OIMPersistIdentityCodec<TNodeRecords>(),
    });
    return { entityService, entityStoreSlot, persistSnapshotResource };
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
            persistBackend: new OIMPersistLocalStorageKeyValueBackend({ persistKeyValueItemStorage }),
            persistScheduler: new OIMPersistMicrotaskScheduler(),
        });
        persistor.addPersistResource(poisonedNodes.persistSnapshotResource);
        persistor.addPersistResource(healthyNodes.persistSnapshotResource);
        persistor.start();

        const cycle: TNode = { id: 'p1' };
        cycle.self = cycle;
        poisonedNodes.entityService.writeSlotContentByKey(poisonedNodes.entityStoreSlot, cycle.id, cycle);
        healthyNodes.entityService.writeSlotContentByKey(healthyNodes.entityStoreSlot, 'h1', { id: 'h1' });
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
            persistBackend: new OIMPersistLocalStorageKeyValueBackend({ persistKeyValueItemStorage }),
            persistScheduler: new OIMPersistMicrotaskScheduler(),
            onPersistError: (_error, persistErrorContext) => persistOperations.push(persistErrorContext.persistOperation),
        });
        persistor.addPersistResource(poisonedNodes.persistSnapshotResource);
        persistor.start();

        const cycle: TNode = { id: 'p1' };
        cycle.self = cycle;
        poisonedNodes.entityService.writeSlotContentByKey(poisonedNodes.entityStoreSlot, cycle.id, cycle);
        for (let i = 0; i < 6; i++) {
            poisonedNodes.entityService.writeSlotContentByKey(poisonedNodes.entityStoreSlot, `n${i}`, { id: `n${i}`, self: cycle });
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
            persistBackend: new OIMPersistLocalStorageKeyValueBackend({ persistKeyValueItemStorage }),
            persistScheduler: new OIMPersistMicrotaskScheduler(),
            onPersistError: (_error, persistErrorContext) => persistOperations.push(persistErrorContext.persistOperation),
        });
        persistor.addPersistResource(poisonedNodes.persistSnapshotResource);
        persistor.start();

        const cycle: TNode = { id: 'p1' };
        cycle.self = cycle;
        for (let i = 0; i < 3; i++) {
            poisonedNodes.entityService.writeSlotContentByKey(poisonedNodes.entityStoreSlot, `n${i}`, { id: `n${i}`, self: cycle });
            await settleAutosave(persistor);
        }
        expect(persistOperations).toEqual(['persist', 'persist', 'quarantine']);

        for (let i = 0; i < 3; i++) poisonedNodes.entityService.writeSlotContentByKey(poisonedNodes.entityStoreSlot, `n${i}`, { id: `n${i}` });
        await persistor.persist();
        poisonedNodes.entityService.writeSlotContentByKey(poisonedNodes.entityStoreSlot, 'n3', { id: 'n3' });
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

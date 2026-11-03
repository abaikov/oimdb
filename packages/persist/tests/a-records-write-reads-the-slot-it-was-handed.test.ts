import type { TOIMStoreKey } from '@oimdb/core';
import { isOIMSlotReleased } from '@oimdb/core';
import {
    OIMPersistCollectionChangeWriteRecordSource,
    OIMPersistRecordsResource,
    OIMPersistMicrotaskScheduler,
    OIMPersistor,
} from '../src';
import { OIMTestPersistBackend } from './shared/OIMTestPersistBackend';
import { createTestEntityCollection } from './shared/createTestEntityCollection';

type TCard = { id: string; title: string };

const tick = (): Promise<void> => new Promise(resolve => { setTimeout(resolve, 0); });

function build() {
    const { db, entityCollectionService, entityStoreSlot, persistEntityWriter } = createTestEntityCollection<TCard>();
    const testPersistBackend = new OIMTestPersistBackend<TOIMStoreKey, TCard>();
    const persistor = new OIMPersistor({
        persistBackend: testPersistBackend,
        persistScheduler: new OIMPersistMicrotaskScheduler(),
    });
    persistor.addPersistResource(new OIMPersistRecordsResource({
        persistRecordSource: new OIMPersistCollectionChangeWriteRecordSource<TOIMStoreKey, TCard>({
            entityCollectionService, entityStoreSlot, persistEntityWriter,
        }),
        persistRecordsService: testPersistBackend.createRecordsStrategy(),
    }));
    persistor.start();
    const entityContentService = entityCollectionService.slotContentService;
    return {
        db,
        entityCollectionService,
        entityStoreSlot,
        persistor,
        testPersistBackend,
        updateCardByKey: (key: TOIMStoreKey, patch: Partial<TCard>): void => {
            entityContentService.updateEntity(entityCollectionService.getSlotByKey(entityStoreSlot, key), patch);
        },
        deleteCardByKey: (key: TOIMStoreKey): void => {
            const cardSlot = entityCollectionService.peekSlotByKey(entityStoreSlot, key);
            if (cardSlot !== undefined) entityContentService.clearSlotContent(cardSlot);
        },
    };
}

describe('a records write', () => {
    it('writes the entity it reads through the slot that was reported, under that slot\'s key', async () => {
        const { entityCollectionService, entityStoreSlot, testPersistBackend } = build();

        const entitySlot = entityCollectionService.writeSlotContentByKey(entityStoreSlot, 'c1', { id: 'c1', title: 'alpha' });
        await tick();

        expect(testPersistBackend.writtenPersistRecordsDeltas).toHaveLength(1);
        const [persistRecord] = testPersistBackend.writtenPersistRecordsDeltas[0].upserts;
        expect(persistRecord.key).toBe(entitySlot.key);
        expect(persistRecord.entity).toBe(entitySlot.entity);
    });

    it('writes nothing for an entity of another store slot of the same service', async () => {
        const { db, entityCollectionService, entityStoreSlot, testPersistBackend } = build();
        const otherEntityStoreSlot = entityCollectionService.createStoreSlot(db);

        entityCollectionService.writeSlotContentByKey(otherEntityStoreSlot, 'o1', { id: 'o1', title: 'other' });
        await tick();
        expect(testPersistBackend.writtenPersistRecordsDeltas).toHaveLength(0);

        entityCollectionService.writeSlotContentByKey(entityStoreSlot, 'c1', { id: 'c1', title: 'alpha' });
        await tick();
        expect(testPersistBackend.readWrittenDeltaUpsertAndDeletedKeys()).toEqual([{ upserts: ['c1'], deletedKeys: [] }]);
    });

    it('keeps a deleted key\'s slot until the write, so a re-upsert inside one batch lands on it as an upsert', async () => {
        const { entityCollectionService, entityStoreSlot, testPersistBackend, deleteCardByKey } = build();
        const entitySlot = entityCollectionService.writeSlotContentByKey(entityStoreSlot, 'c1', { id: 'c1', title: 'alpha' });
        await tick();
        testPersistBackend.writtenPersistRecordsDeltas.length = 0;

        deleteCardByKey('c1');
        expect(isOIMSlotReleased(entitySlot)).toBe(false);
        const upsertedEntitySlot = entityCollectionService.writeSlotContentByKey(entityStoreSlot, 'c1', { id: 'c1', title: 'alpha again' });
        expect(upsertedEntitySlot).toBe(entitySlot);
        await tick();

        expect(testPersistBackend.readWrittenDeltaUpsertAndDeletedKeys()).toEqual([{ upserts: ['c1'], deletedKeys: [] }]);
        expect(testPersistBackend.entityByKey.get('c1')).toEqual({ id: 'c1', title: 'alpha again' });
    });

    it('persists a key written and deleted inside one batch as a deletion', async () => {
        const { entityCollectionService, entityStoreSlot, testPersistBackend, updateCardByKey, deleteCardByKey } = build();
        entityCollectionService.writeSlotContentByKey(entityStoreSlot, 'c1', { id: 'c1', title: 'alpha' });
        await tick();
        testPersistBackend.writtenPersistRecordsDeltas.length = 0;

        updateCardByKey('c1', { title: 'ALPHA' });
        deleteCardByKey('c1');
        await tick();

        expect(testPersistBackend.readWrittenDeltaUpsertAndDeletedKeys()).toEqual([{ upserts: [], deletedKeys: ['c1'] }]);
        expect(testPersistBackend.entityByKey.has('c1')).toBe(false);
    });

    it('touches only the keys that were reported', async () => {
        const { entityCollectionService, entityStoreSlot, testPersistBackend, updateCardByKey } = build();
        entityCollectionService.writeInBatch(entityStoreSlot, () => ([
            { id: 'c1', title: 'alpha' },
            { id: 'c2', title: 'beta' },
            { id: 'c3', title: 'gamma' },
        ]).map(entity => entityCollectionService.writeSlotContentByKey(entityStoreSlot, entity.id, entity)));
        await tick();
        const firstStoredEntity = testPersistBackend.entityByKey.get('c1');
        const thirdStoredEntity = testPersistBackend.entityByKey.get('c3');
        testPersistBackend.writtenPersistRecordsDeltas.length = 0;

        updateCardByKey('c2', { title: 'BETA' });
        await tick();

        expect(testPersistBackend.readWrittenDeltaUpsertAndDeletedKeys()).toEqual([{ upserts: ['c2'], deletedKeys: [] }]);
        expect(testPersistBackend.writtenPersistRecordsList).toEqual([]);
        expect(testPersistBackend.entityByKey.get('c1')).toBe(firstStoredEntity);
        expect(testPersistBackend.entityByKey.get('c3')).toBe(thirdStoredEntity);
        expect(testPersistBackend.entityByKey.get('c2')).toEqual({ id: 'c2', title: 'BETA' });
    });

    it('writes a slot reported twice in one batch once, with what it holds at the write', async () => {
        const { entityCollectionService, entityStoreSlot, testPersistBackend, updateCardByKey } = build();
        entityCollectionService.writeSlotContentByKey(entityStoreSlot, 'c1', { id: 'c1', title: 'alpha' });
        await tick();
        testPersistBackend.writtenPersistRecordsDeltas.length = 0;

        updateCardByKey('c1', { title: 'first' });
        updateCardByKey('c1', { title: 'second' });
        await tick();

        expect(testPersistBackend.writtenPersistRecordsDeltas).toHaveLength(1);
        expect(testPersistBackend.writtenPersistRecordsDeltas[0].upserts).toEqual([{ key: 'c1', entity: { id: 'c1', title: 'second' } }]);
    });
});

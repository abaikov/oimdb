import type { TOIMEntitySlot, TOIMStoreKey } from '@oimdb/core';
import { oimIsSlotReleased } from '@oimdb/core';
import type { OIMPersistKeyValueWriteBatch, TOIMPersistRecords, TOIMPersistRecordsDelta } from '../src';
import {
    OIMPersistIdentityCodec,
    OIMPersistKeyValueBackend,
    OIMPersistKeyValueEntrySnapshotService,
    OIMPersistCollectionChangeWriteRecordSource,
    OIMPersistCollectionWriteRecordSource,
    OIMPersistRecordsResource,
    OIMPersistSnapshotResource,
    OIMPersistMicrotaskScheduler,
    OIMPersistor,
    oimReconcileByKey,
} from '../src';
import { OIMTestKeyValueItemStorage } from './shared/OIMTestKeyValueItemStorage';
import { OIMTestPersistBackend } from './shared/OIMTestPersistBackend';
import { createTestEntityCollection } from './shared/createTestEntityCollection';

type TCard = { id: string; title: string };
type TCardSlot = TOIMEntitySlot<TCard, TOIMStoreKey>;
type TCardPersistRecords = TOIMPersistRecords<TOIMStoreKey, TCard>;
type TCardEntityCollection = ReturnType<typeof createTestEntityCollection<TCard>>;
type TCardEntityCollectionService = TCardEntityCollection['entityCollectionService'];
type TCardEntityStoreSlot = TCardEntityCollection['entityStoreSlot'];

const tick = (): Promise<void> => new Promise(resolve => { setTimeout(resolve, 0); });

const keysOf = (cardPersistRecords: TCardPersistRecords): TOIMStoreKey[] =>
    cardPersistRecords.records.map(persistRecord => persistRecord.key);

const updateCardByKey = (
    cardEntityCollectionService: TCardEntityCollectionService, cardEntityStoreSlot: TCardEntityStoreSlot,
    key: TOIMStoreKey, patch: Partial<TCard>,
): void => {
    cardEntityCollectionService.slotContentService.updateEntity(
        cardEntityCollectionService.getSlotByKey(cardEntityStoreSlot, key), patch,
    );
};

const deleteCardByKey = (
    cardEntityCollectionService: TCardEntityCollectionService, cardEntityStoreSlot: TCardEntityStoreSlot, key: TOIMStoreKey,
): void => {
    const cardSlot = cardEntityCollectionService.findSlotByKey(cardEntityStoreSlot, key);
    if (cardSlot !== undefined) cardEntityCollectionService.slotContentService.clearSlotContent(cardSlot);
};

function buildCards() {
    const {
        entityCollectionService: cardEntityCollectionService, entityStoreSlot: cardEntityStoreSlot, persistEntityWriter,
    } = createTestEntityCollection<TCard>();
    const persistCollectionWriteRecordSource = new OIMPersistCollectionWriteRecordSource<TOIMStoreKey, TCard>({
        entityCollectionService: cardEntityCollectionService,
        entityStoreSlot: cardEntityStoreSlot,
        persistEntityWriter,
    });
    return { cardEntityCollectionService, cardEntityStoreSlot, persistCollectionWriteRecordSource };
}

function buildPersistor() {
    const testKeyValueItemStorage = new OIMTestKeyValueItemStorage();
    const persistKeyValueBackend = new OIMPersistKeyValueBackend({ persistKeyValueStorage: testKeyValueItemStorage });
    const persistor = new OIMPersistor<OIMPersistKeyValueBackend, OIMPersistKeyValueWriteBatch>({
        persistBackend: persistKeyValueBackend,
        persistScheduler: new OIMPersistMicrotaskScheduler(),
    });
    return { testKeyValueItemStorage, persistor };
}

function buildTestPersistor() {
    const testPersistBackend = new OIMTestPersistBackend<TOIMStoreKey, TCard>();
    const persistor = new OIMPersistor({
        persistBackend: testPersistBackend,
        persistScheduler: new OIMPersistMicrotaskScheduler(),
    });
    return { testPersistBackend, persistor };
}

describe('OIMPersistCollectionWriteRecordSource', () => {
    it('reads every entity that holds a value, and no identity that holds none', () => {
        const { cardEntityCollectionService, cardEntityStoreSlot, persistCollectionWriteRecordSource } = buildCards();

        cardEntityCollectionService.writeInBatch(cardEntityStoreSlot, () => ([
            { id: 'c1', title: 'alpha' },
            { id: 'c2', title: 'beta' },
        ]).map(entity => cardEntityCollectionService.writeSlotContentByKey(cardEntityStoreSlot, entity.id, entity)));
        expect(keysOf(persistCollectionWriteRecordSource.readSnapshot())).toEqual(['c1', 'c2']);

        deleteCardByKey(cardEntityCollectionService, cardEntityStoreSlot, 'c1');
        expect(keysOf(persistCollectionWriteRecordSource.readSnapshot())).toEqual(['c2']);
    });

    it('reports the entity slot of each write, at the write, with no frame to wait for', () => {
        const { cardEntityCollectionService, cardEntityStoreSlot, persistCollectionWriteRecordSource } = buildCards();
        const reportedCardSlots = new Set<TCardSlot>();
        persistCollectionWriteRecordSource.subscribeEntitySlotChanged(cardSlot => { reportedCardSlots.add(cardSlot); });

        const cardSlot = cardEntityCollectionService.writeSlotContentByKey(cardEntityStoreSlot, 'c1', { id: 'c1', title: 'alpha' });
        expect(Array.from(reportedCardSlots)).toEqual([cardSlot]);

        reportedCardSlots.clear();
        updateCardByKey(cardEntityCollectionService, cardEntityStoreSlot, 'c1', { title: 'ALPHA' });
        expect(Array.from(reportedCardSlots)).toEqual([cardSlot]);

        reportedCardSlots.clear();
        updateCardByKey(cardEntityCollectionService, cardEntityStoreSlot, 'c1', { title: 'ALPHA' });
        expect(Array.from(reportedCardSlots)).toEqual([]);

        deleteCardByKey(cardEntityCollectionService, cardEntityStoreSlot, 'c1');
        expect(Array.from(reportedCardSlots)).toEqual([cardSlot]);
        expect(persistCollectionWriteRecordSource.readRecordsDelta(new Set([cardSlot]))).toEqual({
            upserts: [],
            deletedKeys: ['c1'],
        });
    });

    it('stops reporting once the subscription is disposed', () => {
        const { cardEntityCollectionService, cardEntityStoreSlot, persistCollectionWriteRecordSource } = buildCards();
        let reportCount = 0;
        const disposer = persistCollectionWriteRecordSource.subscribeSnapshotChanged(() => { reportCount++; });

        cardEntityCollectionService.writeSlotContentByKey(cardEntityStoreSlot, 'c1', { id: 'c1', title: 'alpha' });
        const reportCountBeforeDispose = reportCount;
        expect(reportCountBeforeDispose).toBeGreaterThan(0);

        disposer();
        cardEntityCollectionService.writeSlotContentByKey(cardEntityStoreSlot, 'c2', { id: 'c2', title: 'beta' });
        expect(reportCount).toBe(reportCountBeforeDispose);
    });

    it('reads a delta another collection takes in, upserts and deletions alike', () => {
        const origin = buildCards();
        const originCardSlots = origin.cardEntityCollectionService.writeInBatch(origin.cardEntityStoreSlot, () => ([
            { id: 'c1', title: 'alpha' },
            { id: 'c2', title: 'beta' },
        ]).map(entity => origin.cardEntityCollectionService.writeSlotContentByKey(origin.cardEntityStoreSlot, entity.id, entity)));

        const target = buildCards();
        target.cardEntityCollectionService.writeSlotContentByKey(target.cardEntityStoreSlot, 'c3', { id: 'c3', title: 'gamma' });
        const applyRecordsDelta = (cardPersistRecordsDelta: TOIMPersistRecordsDelta<TOIMStoreKey, TCard>): void => {
            target.cardEntityCollectionService.writeInBatch(target.cardEntityStoreSlot, () => (cardPersistRecordsDelta.upserts.map(persistRecord => ({ ...persistRecord.entity }))).map(entity => target.cardEntityCollectionService.writeSlotContentByKey(target.cardEntityStoreSlot, entity.id, entity)));
            for (const deletedKey of cardPersistRecordsDelta.deletedKeys) {
                deleteCardByKey(target.cardEntityCollectionService, target.cardEntityStoreSlot, deletedKey);
            }
        };

        applyRecordsDelta(origin.persistCollectionWriteRecordSource.readRecordsDelta(new Set(originCardSlots)));
        expect(keysOf(target.persistCollectionWriteRecordSource.readSnapshot())).toEqual(['c3', 'c1', 'c2']);

        deleteCardByKey(origin.cardEntityCollectionService, origin.cardEntityStoreSlot, 'c1');
        applyRecordsDelta(origin.persistCollectionWriteRecordSource.readRecordsDelta(new Set([originCardSlots[0]])));
        expect(keysOf(target.persistCollectionWriteRecordSource.readSnapshot())).toEqual(['c3', 'c2']);
    });

    it('reads named keys as upserts of their current values, skipping a key no slot holds', () => {
        const { cardEntityCollectionService, cardEntityStoreSlot, persistCollectionWriteRecordSource } = buildCards();
        cardEntityCollectionService.writeInBatch(cardEntityStoreSlot, () => ([
            { id: 'c1', title: 'alpha' },
            { id: 'c2', title: 'beta' },
        ]).map(entity => cardEntityCollectionService.writeSlotContentByKey(cardEntityStoreSlot, entity.id, entity)));

        expect(persistCollectionWriteRecordSource.readRecordsDelta(
            persistCollectionWriteRecordSource.findEntitySlotsByKeys(['c2', 'missing']),
        )).toEqual({
            upserts: [{ key: 'c2', entity: { id: 'c2', title: 'beta' } }],
            deletedKeys: [],
        });
    });

    it('makes the collection exactly the snapshot, evicting an entity the snapshot does not name', () => {
        const { cardEntityCollectionService, cardEntityStoreSlot, persistCollectionWriteRecordSource } = buildCards();
        cardEntityCollectionService.writeInBatch(cardEntityStoreSlot, () => ([
            { id: 'c1', title: 'alpha' },
            { id: 'c2', title: 'beta' },
        ]).map(entity => cardEntityCollectionService.writeSlotContentByKey(cardEntityStoreSlot, entity.id, entity)));

        persistCollectionWriteRecordSource.writeSnapshot({ records: [{ key: 'c1', entity: { id: 'c1', title: 'ALPHA' } }] });

        expect(keysOf(persistCollectionWriteRecordSource.readSnapshot())).toEqual(['c1']);
        expect(cardEntityCollectionService.findSlotByKey(cardEntityStoreSlot, 'c1')?.entity?.title).toBe('ALPHA');
        expect(cardEntityCollectionService.findSlotByKey(cardEntityStoreSlot, 'c2')?.entity).toBeUndefined();
    });

    it('reads a key released and minted again as the live entity, not as a deletion', () => {
        const { cardEntityCollectionService, cardEntityStoreSlot, persistCollectionWriteRecordSource } = buildCards();
        const releasedCardSlot = cardEntityCollectionService.writeSlotContentByKey(cardEntityStoreSlot, 'c1', { id: 'c1', title: 'alpha' });
        deleteCardByKey(cardEntityCollectionService, cardEntityStoreSlot, 'c1');
        const mintedCardSlot = cardEntityCollectionService.writeSlotContentByKey(cardEntityStoreSlot, 'c1', { id: 'c1', title: 'again' });

        expect(oimIsSlotReleased(releasedCardSlot)).toBe(true);
        expect(mintedCardSlot).not.toBe(releasedCardSlot);
        expect(persistCollectionWriteRecordSource.readRecordsDelta(new Set([releasedCardSlot, mintedCardSlot]))).toEqual({
            upserts: [{ key: 'c1', entity: { id: 'c1', title: 'again' } }],
            deletedKeys: [],
        });
        expect(persistCollectionWriteRecordSource.readRecordsDelta(new Set([mintedCardSlot, releasedCardSlot]))).toEqual({
            upserts: [{ key: 'c1', entity: { id: 'c1', title: 'again' } }],
            deletedKeys: [],
        });
    });
});

describe('a records resource over the write-driven arm', () => {
    it('does not report its own restore, and does report the next change', async () => {
        const { cardEntityCollectionService, cardEntityStoreSlot, persistCollectionWriteRecordSource } = buildCards();
        const { testPersistBackend } = buildTestPersistor();
        testPersistBackend.storeRecords({ records: [{ key: 'c1', entity: { id: 'c1', title: 'stored' } }] });
        const persistRecordsResource = new OIMPersistRecordsResource({
            persistRecordSource: persistCollectionWriteRecordSource,
            persistRecordsService: testPersistBackend.createRecordsStrategy(),
        });

        let reportCount = 0;
        persistRecordsResource.start(() => { reportCount++; });
        cardEntityCollectionService.writeSlotContentByKey(cardEntityStoreSlot, 'c1', { id: 'c1', title: 'alpha' });
        const reportCountBeforeHydrate = reportCount;
        expect(reportCountBeforeHydrate).toBeGreaterThan(0);

        await persistRecordsResource.hydrate(testPersistBackend);
        expect(cardEntityCollectionService.findSlotByKey(cardEntityStoreSlot, 'c1')?.entity?.title).toBe('stored');
        expect(reportCount).toBe(reportCountBeforeHydrate);

        updateCardByKey(cardEntityCollectionService, cardEntityStoreSlot, 'c1', { title: 'edited' });
        expect(reportCount).toBeGreaterThan(reportCountBeforeHydrate);

        persistRecordsResource.stop();
    });

    it('persists an in-place mutation announced through markEntityChanged over the change-driven arm', async () => {
        const {
            db, entityCollectionService: cardEntityCollectionService, entityStoreSlot: cardEntityStoreSlot, persistEntityWriter,
        } = createTestEntityCollection<TCard>();
        const { testPersistBackend, persistor } = buildTestPersistor();
        persistor.addPersistResource(new OIMPersistRecordsResource({
            persistRecordSource: new OIMPersistCollectionChangeWriteRecordSource<TOIMStoreKey, TCard>({
                entityCollectionService: cardEntityCollectionService,
                entityStoreSlot: cardEntityStoreSlot,
                persistEntityWriter,
            }),
            persistRecordsService: testPersistBackend.createRecordsStrategy(),
        }));
        persistor.start();
        const cardSlot = cardEntityCollectionService.writeSlotContentByKey(cardEntityStoreSlot, 'c1', { id: 'c1', title: 'alpha' });
        await tick();
        expect(testPersistBackend.readStoredEntities()).toEqual([['c1', { id: 'c1', title: 'alpha' }]]);

        (cardSlot.entity as TCard).title = 'mutated';
        cardEntityCollectionService.slotContentService.markEntityChanged(cardSlot, ['title']);
        db.flush();
        await tick();

        expect(testPersistBackend.readStoredEntities()).toEqual([['c1', { id: 'c1', title: 'mutated' }]]);

        persistor.destroy();
    });

    it('does not persist a markEntityChanged edit over the write-driven arm, and the change-driven arm does', async () => {
        const writeDrivenCards = createTestEntityCollection<TCard>();
        const changeDrivenCards = createTestEntityCollection<TCard>();
        const writeDrivenTestPersistor = buildTestPersistor();
        const changeDrivenTestPersistor = buildTestPersistor();
        writeDrivenTestPersistor.persistor.addPersistResource(new OIMPersistRecordsResource({
            persistRecordSource: new OIMPersistCollectionWriteRecordSource<TOIMStoreKey, TCard>({
                entityCollectionService: writeDrivenCards.entityCollectionService,
                entityStoreSlot: writeDrivenCards.entityStoreSlot,
                persistEntityWriter: writeDrivenCards.persistEntityWriter,
            }),
            persistRecordsService: writeDrivenTestPersistor.testPersistBackend.createRecordsStrategy(),
        }));
        changeDrivenTestPersistor.persistor.addPersistResource(new OIMPersistRecordsResource({
            persistRecordSource: new OIMPersistCollectionChangeWriteRecordSource<TOIMStoreKey, TCard>({
                entityCollectionService: changeDrivenCards.entityCollectionService,
                entityStoreSlot: changeDrivenCards.entityStoreSlot,
                persistEntityWriter: changeDrivenCards.persistEntityWriter,
            }),
            persistRecordsService: changeDrivenTestPersistor.testPersistBackend.createRecordsStrategy(),
        }));
        writeDrivenTestPersistor.persistor.start();
        changeDrivenTestPersistor.persistor.start();
        const writeDrivenCardSlot = writeDrivenCards.entityCollectionService.writeSlotContentByKey(writeDrivenCards.entityStoreSlot, 'c1', { id: 'c1', title: 'alpha' });
        const changeDrivenCardSlot = changeDrivenCards.entityCollectionService.writeSlotContentByKey(changeDrivenCards.entityStoreSlot, 'c1', { id: 'c1', title: 'alpha' });
        await tick();
        expect(writeDrivenTestPersistor.testPersistBackend.readStoredEntities()).toEqual([['c1', { id: 'c1', title: 'alpha' }]]);
        expect(changeDrivenTestPersistor.testPersistBackend.readStoredEntities()).toEqual([['c1', { id: 'c1', title: 'alpha' }]]);

        (writeDrivenCardSlot.entity as TCard).title = 'mutated';
        writeDrivenCards.entityCollectionService.slotContentService.markEntityChanged(writeDrivenCardSlot, ['title']);
        writeDrivenCards.db.flush();
        (changeDrivenCardSlot.entity as TCard).title = 'mutated';
        changeDrivenCards.entityCollectionService.slotContentService.markEntityChanged(changeDrivenCardSlot, ['title']);
        changeDrivenCards.db.flush();
        await tick();

        expect(writeDrivenTestPersistor.testPersistBackend.readStoredEntities()).toEqual([['c1', { id: 'c1', title: 'alpha' }]]);
        expect(writeDrivenTestPersistor.testPersistBackend.commitCount).toBe(1);
        expect(changeDrivenTestPersistor.testPersistBackend.readStoredEntities()).toEqual([['c1', { id: 'c1', title: 'mutated' }]]);

        writeDrivenTestPersistor.persistor.destroy();
        changeDrivenTestPersistor.persistor.destroy();
    });

    it('writes a key deleted and written again before the drain as one upsert of the live entity', async () => {
        const { cardEntityCollectionService, cardEntityStoreSlot, persistCollectionWriteRecordSource } = buildCards();
        const { testPersistBackend, persistor } = buildTestPersistor();
        persistor.addPersistResource(new OIMPersistRecordsResource({
            persistRecordSource: persistCollectionWriteRecordSource,
            persistRecordsService: testPersistBackend.createRecordsStrategy(),
        }));
        persistor.start();

        cardEntityCollectionService.writeSlotContentByKey(cardEntityStoreSlot, 'c1', { id: 'c1', title: 'alpha' });
        await tick();
        deleteCardByKey(cardEntityCollectionService, cardEntityStoreSlot, 'c1');
        cardEntityCollectionService.writeSlotContentByKey(cardEntityStoreSlot, 'c1', { id: 'c1', title: 'again' });
        await tick();

        expect(testPersistBackend.writtenPersistRecordsDeltas).toEqual([
            { upserts: [{ key: 'c1', entity: { id: 'c1', title: 'alpha' } }], deletedKeys: [] },
            { upserts: [{ key: 'c1', entity: { id: 'c1', title: 'again' } }], deletedKeys: [] },
        ]);

        persistor.destroy();
    });

    it('writes a delete when the key is gone by the time of the drain', async () => {
        const { cardEntityCollectionService, cardEntityStoreSlot, persistCollectionWriteRecordSource } = buildCards();
        const { testPersistBackend, persistor } = buildTestPersistor();
        persistor.addPersistResource(new OIMPersistRecordsResource({
            persistRecordSource: persistCollectionWriteRecordSource,
            persistRecordsService: testPersistBackend.createRecordsStrategy(),
        }));
        persistor.start();

        cardEntityCollectionService.writeSlotContentByKey(cardEntityStoreSlot, 'c1', { id: 'c1', title: 'alpha' });
        cardEntityCollectionService.writeSlotContentByKey(cardEntityStoreSlot, 'c2', { id: 'c2', title: 'beta' });
        await tick();
        deleteCardByKey(cardEntityCollectionService, cardEntityStoreSlot, 'c1');
        await tick();

        expect(testPersistBackend.writtenPersistRecordsDeltas).toEqual([
            {
                upserts: [
                    { key: 'c1', entity: { id: 'c1', title: 'alpha' } },
                    { key: 'c2', entity: { id: 'c2', title: 'beta' } },
                ],
                deletedKeys: [],
            },
            { upserts: [], deletedKeys: ['c1'] },
        ]);

        persistor.destroy();
    });
});

describe('hydrating a whole collection', () => {
    function addCardsPersistResourceSnapshot(
        persistor: OIMPersistor<OIMPersistKeyValueBackend, OIMPersistKeyValueWriteBatch>,
        persistCollectionWriteRecordSource: OIMPersistCollectionWriteRecordSource<TOIMStoreKey, TCard>,
        withReconcile: boolean,
    ): void {
        persistor.addPersistResource(new OIMPersistSnapshotResource({
            persistSnapshotSource: persistCollectionWriteRecordSource,
            persistSnapshotService: new OIMPersistKeyValueEntrySnapshotService<TCardPersistRecords>({ storageKey: 'cards' }),
            persistCodec: new OIMPersistIdentityCodec<TCardPersistRecords>(),
            persistHydrateReconcile: withReconcile
                ? oimReconcileByKey<TOIMStoreKey, TCard>((_currentCard, incomingCard) => incomingCard)
                : undefined,
        }));
    }

    it('evicts what the stored snapshot does not name, with no reconcile', async () => {
        const { testKeyValueItemStorage, persistor } = buildPersistor();
        testKeyValueItemStorage.itemByStorageKey.set('cards', JSON.stringify({
            records: [{ key: 'c1', entity: { id: 'c1', title: 'stored' } }],
        }));
        const { cardEntityCollectionService, cardEntityStoreSlot, persistCollectionWriteRecordSource } = buildCards();
        addCardsPersistResourceSnapshot(persistor, persistCollectionWriteRecordSource, false);
        cardEntityCollectionService.writeSlotContentByKey(cardEntityStoreSlot, 'c2', { id: 'c2', title: 'seeded' });

        await persistor.hydrate();

        expect(cardEntityCollectionService.findSlotByKey(cardEntityStoreSlot, 'c1')?.entity?.title).toBe('stored');
        expect(cardEntityCollectionService.findSlotByKey(cardEntityStoreSlot, 'c2')?.entity).toBeUndefined();
    });

    it('keeps it when the resource was given oimReconcileByKey', async () => {
        const { testKeyValueItemStorage, persistor } = buildPersistor();
        testKeyValueItemStorage.itemByStorageKey.set('cards', JSON.stringify({
            records: [{ key: 'c1', entity: { id: 'c1', title: 'stored' } }],
        }));
        const { cardEntityCollectionService, cardEntityStoreSlot, persistCollectionWriteRecordSource } = buildCards();
        addCardsPersistResourceSnapshot(persistor, persistCollectionWriteRecordSource, true);
        cardEntityCollectionService.writeSlotContentByKey(cardEntityStoreSlot, 'c2', { id: 'c2', title: 'seeded' });

        await persistor.hydrate();

        expect(cardEntityCollectionService.findSlotByKey(cardEntityStoreSlot, 'c1')?.entity?.title).toBe('stored');
        expect(cardEntityCollectionService.findSlotByKey(cardEntityStoreSlot, 'c2')?.entity?.title).toBe('seeded');
    });

    it('does not write the hydrated collection back out when autosave starts after it', async () => {
        const { testKeyValueItemStorage, persistor } = buildPersistor();
        const storedItem = JSON.stringify({ records: [{ key: 'c1', entity: { id: 'c1', title: 'stored' } }] });
        testKeyValueItemStorage.itemByStorageKey.set('cards', storedItem);
        const { cardEntityCollectionService, cardEntityStoreSlot, persistCollectionWriteRecordSource } = buildCards();
        addCardsPersistResourceSnapshot(persistor, persistCollectionWriteRecordSource, false);

        await persistor.hydrate();
        persistor.start();
        await tick();
        expect(testKeyValueItemStorage.itemByStorageKey.get('cards')).toBe(storedItem);

        updateCardByKey(cardEntityCollectionService, cardEntityStoreSlot, 'c1', { title: 'edited' });
        await tick();
        expect(JSON.parse(testKeyValueItemStorage.itemByStorageKey.get('cards') ?? 'null')).toEqual({
            records: [{ key: 'c1', entity: { id: 'c1', title: 'edited' } }],
        });

        persistor.destroy();
    });
});

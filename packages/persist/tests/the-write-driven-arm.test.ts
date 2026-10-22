import type { TOIMEntitySlot, TOIMStoreKey } from '@oimdb/core';
import { oimIsSlotReleased } from '@oimdb/core';
import type { OIMPersistKeyValueWriteBatch, TOIMPersistRecords, TOIMPersistRecordsDelta } from '../src';
import {
    OIMPersistCodecIdentity,
    OIMPersistKeyValueBackend,
    OIMPersistKeyValueEntryStrategy,
    OIMPersistRecordSourceCollectionChangeDriven,
    OIMPersistRecordSourceCollectionWriteDriven,
    OIMPersistResourceRecords,
    OIMPersistResourceSnapshot,
    OIMPersistSchedulerMicrotaskDriven,
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
    if (cardSlot !== undefined) cardEntityCollectionService.slotContentService.deleteEntity(cardSlot);
};

function buildCards() {
    const {
        entityCollectionService: cardEntityCollectionService, entityStoreSlot: cardEntityStoreSlot, persistEntityWriter,
    } = createTestEntityCollection<TCard>();
    const persistRecordSourceCollectionWriteDriven = new OIMPersistRecordSourceCollectionWriteDriven<TOIMStoreKey, TCard>({
        entityCollectionService: cardEntityCollectionService,
        entityStoreSlot: cardEntityStoreSlot,
        persistEntityWriter,
    });
    return { cardEntityCollectionService, cardEntityStoreSlot, persistRecordSourceCollectionWriteDriven };
}

function buildPersistor() {
    const testKeyValueItemStorage = new OIMTestKeyValueItemStorage();
    const persistKeyValueBackend = new OIMPersistKeyValueBackend({ persistKeyValueStorage: testKeyValueItemStorage });
    const persistor = new OIMPersistor<OIMPersistKeyValueBackend, OIMPersistKeyValueWriteBatch>({
        persistBackend: persistKeyValueBackend,
        persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
    });
    return { testKeyValueItemStorage, persistor };
}

function buildTestPersistor() {
    const testPersistBackend = new OIMTestPersistBackend<TOIMStoreKey, TCard>();
    const persistor = new OIMPersistor({
        persistBackend: testPersistBackend,
        persistScheduler: new OIMPersistSchedulerMicrotaskDriven(),
    });
    return { testPersistBackend, persistor };
}

describe('OIMPersistRecordSourceCollectionWriteDriven', () => {
    it('reads every entity that holds a value, and no identity that holds none', () => {
        const { cardEntityCollectionService, cardEntityStoreSlot, persistRecordSourceCollectionWriteDriven } = buildCards();

        cardEntityCollectionService.slotContentService.upsertEntities(cardEntityStoreSlot, [
            { id: 'c1', title: 'alpha' },
            { id: 'c2', title: 'beta' },
        ]);
        expect(keysOf(persistRecordSourceCollectionWriteDriven.readSnapshot())).toEqual(['c1', 'c2']);

        deleteCardByKey(cardEntityCollectionService, cardEntityStoreSlot, 'c1');
        expect(keysOf(persistRecordSourceCollectionWriteDriven.readSnapshot())).toEqual(['c2']);
    });

    it('reports the entity slot of each write, at the write, with no frame to wait for', () => {
        const { cardEntityCollectionService, cardEntityStoreSlot, persistRecordSourceCollectionWriteDriven } = buildCards();
        const reportedCardSlots = new Set<TCardSlot>();
        persistRecordSourceCollectionWriteDriven.subscribeEntitySlotChanged(cardSlot => { reportedCardSlots.add(cardSlot); });

        const cardSlot = cardEntityCollectionService.slotContentService.upsertEntity(cardEntityStoreSlot, { id: 'c1', title: 'alpha' });
        expect(Array.from(reportedCardSlots)).toEqual([cardSlot]);

        reportedCardSlots.clear();
        updateCardByKey(cardEntityCollectionService, cardEntityStoreSlot, 'c1', { title: 'ALPHA' });
        expect(Array.from(reportedCardSlots)).toEqual([cardSlot]);

        reportedCardSlots.clear();
        updateCardByKey(cardEntityCollectionService, cardEntityStoreSlot, 'c1', { title: 'ALPHA' });
        expect(Array.from(reportedCardSlots)).toEqual([]);

        deleteCardByKey(cardEntityCollectionService, cardEntityStoreSlot, 'c1');
        expect(Array.from(reportedCardSlots)).toEqual([cardSlot]);
        expect(persistRecordSourceCollectionWriteDriven.readRecordsDelta(new Set([cardSlot]))).toEqual({
            upserts: [],
            deletedKeys: ['c1'],
        });
    });

    it('stops reporting once the subscription is disposed', () => {
        const { cardEntityCollectionService, cardEntityStoreSlot, persistRecordSourceCollectionWriteDriven } = buildCards();
        let reportCount = 0;
        const disposer = persistRecordSourceCollectionWriteDriven.subscribeSnapshotChanged(() => { reportCount++; });

        cardEntityCollectionService.slotContentService.upsertEntity(cardEntityStoreSlot, { id: 'c1', title: 'alpha' });
        const reportCountBeforeDispose = reportCount;
        expect(reportCountBeforeDispose).toBeGreaterThan(0);

        disposer();
        cardEntityCollectionService.slotContentService.upsertEntity(cardEntityStoreSlot, { id: 'c2', title: 'beta' });
        expect(reportCount).toBe(reportCountBeforeDispose);
    });

    it('reads a delta another collection takes in, upserts and deletions alike', () => {
        const origin = buildCards();
        const originCardSlots = origin.cardEntityCollectionService.slotContentService.upsertEntities(origin.cardEntityStoreSlot, [
            { id: 'c1', title: 'alpha' },
            { id: 'c2', title: 'beta' },
        ]);

        const target = buildCards();
        target.cardEntityCollectionService.slotContentService.upsertEntity(target.cardEntityStoreSlot, { id: 'c3', title: 'gamma' });
        const applyRecordsDelta = (cardPersistRecordsDelta: TOIMPersistRecordsDelta<TOIMStoreKey, TCard>): void => {
            target.cardEntityCollectionService.slotContentService.upsertEntities(
                target.cardEntityStoreSlot, cardPersistRecordsDelta.upserts.map(persistRecord => ({ ...persistRecord.entity })),
            );
            for (const deletedKey of cardPersistRecordsDelta.deletedKeys) {
                deleteCardByKey(target.cardEntityCollectionService, target.cardEntityStoreSlot, deletedKey);
            }
        };

        applyRecordsDelta(origin.persistRecordSourceCollectionWriteDriven.readRecordsDelta(new Set(originCardSlots)));
        expect(keysOf(target.persistRecordSourceCollectionWriteDriven.readSnapshot())).toEqual(['c3', 'c1', 'c2']);

        deleteCardByKey(origin.cardEntityCollectionService, origin.cardEntityStoreSlot, 'c1');
        applyRecordsDelta(origin.persistRecordSourceCollectionWriteDriven.readRecordsDelta(new Set([originCardSlots[0]])));
        expect(keysOf(target.persistRecordSourceCollectionWriteDriven.readSnapshot())).toEqual(['c3', 'c2']);
    });

    it('reads named keys as upserts of their current values, skipping a key no slot holds', () => {
        const { cardEntityCollectionService, cardEntityStoreSlot, persistRecordSourceCollectionWriteDriven } = buildCards();
        cardEntityCollectionService.slotContentService.upsertEntities(cardEntityStoreSlot, [
            { id: 'c1', title: 'alpha' },
            { id: 'c2', title: 'beta' },
        ]);

        expect(persistRecordSourceCollectionWriteDriven.readRecordsDelta(
            persistRecordSourceCollectionWriteDriven.findEntitySlotsByKeys(['c2', 'missing']),
        )).toEqual({
            upserts: [{ key: 'c2', entity: { id: 'c2', title: 'beta' } }],
            deletedKeys: [],
        });
    });

    it('makes the collection exactly the snapshot, evicting an entity the snapshot does not name', () => {
        const { cardEntityCollectionService, cardEntityStoreSlot, persistRecordSourceCollectionWriteDriven } = buildCards();
        cardEntityCollectionService.slotContentService.upsertEntities(cardEntityStoreSlot, [
            { id: 'c1', title: 'alpha' },
            { id: 'c2', title: 'beta' },
        ]);

        persistRecordSourceCollectionWriteDriven.writeSnapshot({ records: [{ key: 'c1', entity: { id: 'c1', title: 'ALPHA' } }] });

        expect(keysOf(persistRecordSourceCollectionWriteDriven.readSnapshot())).toEqual(['c1']);
        expect(cardEntityCollectionService.slotContentService.findEntityByKey(cardEntityStoreSlot, 'c1')?.title).toBe('ALPHA');
        expect(cardEntityCollectionService.slotContentService.findEntityByKey(cardEntityStoreSlot, 'c2')).toBeUndefined();
    });

    it('reads a key released and minted again as the live entity, not as a deletion', () => {
        const { cardEntityCollectionService, cardEntityStoreSlot, persistRecordSourceCollectionWriteDriven } = buildCards();
        const releasedCardSlot = cardEntityCollectionService.slotContentService.upsertEntity(
            cardEntityStoreSlot, { id: 'c1', title: 'alpha' },
        );
        deleteCardByKey(cardEntityCollectionService, cardEntityStoreSlot, 'c1');
        const mintedCardSlot = cardEntityCollectionService.slotContentService.upsertEntity(
            cardEntityStoreSlot, { id: 'c1', title: 'again' },
        );

        expect(oimIsSlotReleased(releasedCardSlot)).toBe(true);
        expect(mintedCardSlot).not.toBe(releasedCardSlot);
        expect(persistRecordSourceCollectionWriteDriven.readRecordsDelta(new Set([releasedCardSlot, mintedCardSlot]))).toEqual({
            upserts: [{ key: 'c1', entity: { id: 'c1', title: 'again' } }],
            deletedKeys: [],
        });
        expect(persistRecordSourceCollectionWriteDriven.readRecordsDelta(new Set([mintedCardSlot, releasedCardSlot]))).toEqual({
            upserts: [{ key: 'c1', entity: { id: 'c1', title: 'again' } }],
            deletedKeys: [],
        });
    });
});

describe('a records resource over the write-driven arm', () => {
    it('does not report its own restore, and does report the next change', async () => {
        const { cardEntityCollectionService, cardEntityStoreSlot, persistRecordSourceCollectionWriteDriven } = buildCards();
        const { testPersistBackend } = buildTestPersistor();
        testPersistBackend.storeRecords({ records: [{ key: 'c1', entity: { id: 'c1', title: 'stored' } }] });
        const persistResourceRecords = new OIMPersistResourceRecords({
            persistRecordSource: persistRecordSourceCollectionWriteDriven,
            persistRecordsStrategy: testPersistBackend.createRecordsStrategy(),
        });

        let reportCount = 0;
        persistResourceRecords.start(() => { reportCount++; });
        cardEntityCollectionService.slotContentService.upsertEntity(cardEntityStoreSlot, { id: 'c1', title: 'alpha' });
        const reportCountBeforeHydrate = reportCount;
        expect(reportCountBeforeHydrate).toBeGreaterThan(0);

        await persistResourceRecords.hydrate(testPersistBackend);
        expect(cardEntityCollectionService.slotContentService.findEntityByKey(cardEntityStoreSlot, 'c1')?.title).toBe('stored');
        expect(reportCount).toBe(reportCountBeforeHydrate);

        updateCardByKey(cardEntityCollectionService, cardEntityStoreSlot, 'c1', { title: 'edited' });
        expect(reportCount).toBeGreaterThan(reportCountBeforeHydrate);

        persistResourceRecords.stop();
    });

    it('persists an in-place mutation announced through markEntityChanged over the change-driven arm', async () => {
        const {
            db, entityCollectionService: cardEntityCollectionService, entityStoreSlot: cardEntityStoreSlot, persistEntityWriter,
        } = createTestEntityCollection<TCard>();
        const { testPersistBackend, persistor } = buildTestPersistor();
        persistor.addPersistResource(new OIMPersistResourceRecords({
            persistRecordSource: new OIMPersistRecordSourceCollectionChangeDriven<TOIMStoreKey, TCard>({
                entityCollectionService: cardEntityCollectionService,
                entityStoreSlot: cardEntityStoreSlot,
                persistEntityWriter,
            }),
            persistRecordsStrategy: testPersistBackend.createRecordsStrategy(),
        }));
        persistor.start();
        const cardSlot = cardEntityCollectionService.slotContentService.upsertEntity(cardEntityStoreSlot, { id: 'c1', title: 'alpha' });
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
        writeDrivenTestPersistor.persistor.addPersistResource(new OIMPersistResourceRecords({
            persistRecordSource: new OIMPersistRecordSourceCollectionWriteDriven<TOIMStoreKey, TCard>({
                entityCollectionService: writeDrivenCards.entityCollectionService,
                entityStoreSlot: writeDrivenCards.entityStoreSlot,
                persistEntityWriter: writeDrivenCards.persistEntityWriter,
            }),
            persistRecordsStrategy: writeDrivenTestPersistor.testPersistBackend.createRecordsStrategy(),
        }));
        changeDrivenTestPersistor.persistor.addPersistResource(new OIMPersistResourceRecords({
            persistRecordSource: new OIMPersistRecordSourceCollectionChangeDriven<TOIMStoreKey, TCard>({
                entityCollectionService: changeDrivenCards.entityCollectionService,
                entityStoreSlot: changeDrivenCards.entityStoreSlot,
                persistEntityWriter: changeDrivenCards.persistEntityWriter,
            }),
            persistRecordsStrategy: changeDrivenTestPersistor.testPersistBackend.createRecordsStrategy(),
        }));
        writeDrivenTestPersistor.persistor.start();
        changeDrivenTestPersistor.persistor.start();
        const writeDrivenCardSlot = writeDrivenCards.entityCollectionService.slotContentService.upsertEntity(
            writeDrivenCards.entityStoreSlot, { id: 'c1', title: 'alpha' },
        );
        const changeDrivenCardSlot = changeDrivenCards.entityCollectionService.slotContentService.upsertEntity(
            changeDrivenCards.entityStoreSlot, { id: 'c1', title: 'alpha' },
        );
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
        const { cardEntityCollectionService, cardEntityStoreSlot, persistRecordSourceCollectionWriteDriven } = buildCards();
        const { testPersistBackend, persistor } = buildTestPersistor();
        persistor.addPersistResource(new OIMPersistResourceRecords({
            persistRecordSource: persistRecordSourceCollectionWriteDriven,
            persistRecordsStrategy: testPersistBackend.createRecordsStrategy(),
        }));
        persistor.start();

        cardEntityCollectionService.slotContentService.upsertEntity(cardEntityStoreSlot, { id: 'c1', title: 'alpha' });
        await tick();
        deleteCardByKey(cardEntityCollectionService, cardEntityStoreSlot, 'c1');
        cardEntityCollectionService.slotContentService.upsertEntity(cardEntityStoreSlot, { id: 'c1', title: 'again' });
        await tick();

        expect(testPersistBackend.writtenPersistRecordsDeltas).toEqual([
            { upserts: [{ key: 'c1', entity: { id: 'c1', title: 'alpha' } }], deletedKeys: [] },
            { upserts: [{ key: 'c1', entity: { id: 'c1', title: 'again' } }], deletedKeys: [] },
        ]);

        persistor.destroy();
    });

    it('writes a delete when the key is gone by the time of the drain', async () => {
        const { cardEntityCollectionService, cardEntityStoreSlot, persistRecordSourceCollectionWriteDriven } = buildCards();
        const { testPersistBackend, persistor } = buildTestPersistor();
        persistor.addPersistResource(new OIMPersistResourceRecords({
            persistRecordSource: persistRecordSourceCollectionWriteDriven,
            persistRecordsStrategy: testPersistBackend.createRecordsStrategy(),
        }));
        persistor.start();

        cardEntityCollectionService.slotContentService.upsertEntity(cardEntityStoreSlot, { id: 'c1', title: 'alpha' });
        cardEntityCollectionService.slotContentService.upsertEntity(cardEntityStoreSlot, { id: 'c2', title: 'beta' });
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
        persistRecordSourceCollectionWriteDriven: OIMPersistRecordSourceCollectionWriteDriven<TOIMStoreKey, TCard>,
        withReconcile: boolean,
    ): void {
        persistor.addPersistResource(new OIMPersistResourceSnapshot({
            persistSnapshotSource: persistRecordSourceCollectionWriteDriven,
            persistSnapshotStrategy: new OIMPersistKeyValueEntryStrategy<TCardPersistRecords>({ storageKey: 'cards' }),
            persistCodec: new OIMPersistCodecIdentity<TCardPersistRecords>(),
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
        const { cardEntityCollectionService, cardEntityStoreSlot, persistRecordSourceCollectionWriteDriven } = buildCards();
        addCardsPersistResourceSnapshot(persistor, persistRecordSourceCollectionWriteDriven, false);
        cardEntityCollectionService.slotContentService.upsertEntity(cardEntityStoreSlot, { id: 'c2', title: 'seeded' });

        await persistor.hydrate();

        expect(cardEntityCollectionService.slotContentService.findEntityByKey(cardEntityStoreSlot, 'c1')?.title).toBe('stored');
        expect(cardEntityCollectionService.slotContentService.findEntityByKey(cardEntityStoreSlot, 'c2')).toBeUndefined();
    });

    it('keeps it when the resource was given oimReconcileByKey', async () => {
        const { testKeyValueItemStorage, persistor } = buildPersistor();
        testKeyValueItemStorage.itemByStorageKey.set('cards', JSON.stringify({
            records: [{ key: 'c1', entity: { id: 'c1', title: 'stored' } }],
        }));
        const { cardEntityCollectionService, cardEntityStoreSlot, persistRecordSourceCollectionWriteDriven } = buildCards();
        addCardsPersistResourceSnapshot(persistor, persistRecordSourceCollectionWriteDriven, true);
        cardEntityCollectionService.slotContentService.upsertEntity(cardEntityStoreSlot, { id: 'c2', title: 'seeded' });

        await persistor.hydrate();

        expect(cardEntityCollectionService.slotContentService.findEntityByKey(cardEntityStoreSlot, 'c1')?.title).toBe('stored');
        expect(cardEntityCollectionService.slotContentService.findEntityByKey(cardEntityStoreSlot, 'c2')?.title).toBe('seeded');
    });

    it('does not write the hydrated collection back out when autosave starts after it', async () => {
        const { testKeyValueItemStorage, persistor } = buildPersistor();
        const storedItem = JSON.stringify({ records: [{ key: 'c1', entity: { id: 'c1', title: 'stored' } }] });
        testKeyValueItemStorage.itemByStorageKey.set('cards', storedItem);
        const { cardEntityCollectionService, cardEntityStoreSlot, persistRecordSourceCollectionWriteDriven } = buildCards();
        addCardsPersistResourceSnapshot(persistor, persistRecordSourceCollectionWriteDriven, false);

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

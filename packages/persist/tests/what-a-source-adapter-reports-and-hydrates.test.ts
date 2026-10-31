import type {
    TOIMBucketSlot,
    TOIMBucketSlotsArrayStore,
    TOIMBucketSlotsSetStore,
    TOIMEntitySlot,
    TOIMStoreKey,
} from '@oimdb/core';
import { OIMDB, OIMEffectService, OIMSlotContentSetBucketService } from '@oimdb/core';
import type { TOIMPersistRecord } from '../src';
import { OIMPersistBucketRecordSource, OIMPersistSingleEntitySnapshotSource } from '../src';
import { createOIMSlotContentEntityService } from '@oimdb/core';
import { createOIMSlotCollectionService } from '@oimdb/core';
import { createOIMSingleSlotService } from '@oimdb/core';
import { OIMSlotContentPositionalArrayBucketService } from '@oimdb/core';
import { OIMBucketCommands } from '@oimdb/core';

type TCard = { id: string; deckId: string; title: string; draft: boolean };
type TCardSlot = TOIMEntitySlot<TCard, TOIMStoreKey>;
type TCardSlots = TOIMBucketSlotsSetStore<TCardSlot>;

const buildCards = () => {
    const db = new OIMDB();
    const entityCollectionService = createOIMSlotCollectionService({ slotContentService: createOIMSlotContentEntityService<TCard>() });
    return { db, entityCollectionService, entityStoreSlot: entityCollectionService.createStoreSlot(db) };
};

type TCardCollectionService = ReturnType<typeof buildCards>['entityCollectionService'];
type TCardStoreSlot = ReturnType<typeof buildCards>['entityStoreSlot'];

const createCardBucketCollectionService = () =>
    createOIMSlotCollectionService({ slotContentService: new OIMSlotContentSetBucketService<TCardSlot>() });

type TFiling = {
    bucketCollectionService: ReturnType<typeof createCardBucketCollectionService>;
    bucketSlot: TOIMBucketSlot<TCardSlots, TOIMStoreKey>;
    putCards: (...cards: readonly TCard[]) => void;
    dropCard: (id: string) => void;
};

const fileCards = (
    db: OIMDB,
    entityCollectionService: TCardCollectionService,
    entityStoreSlot: TCardStoreSlot,
    bucketKey: string,
    isFiled: (card: TCard) => boolean,
): TFiling => {
    const bucketCollectionService = createCardBucketCollectionService();
    const bucketStoreSlot = bucketCollectionService.createStoreSlot(db);
    const bucketSlot = bucketCollectionService.holdSlotByKey(bucketStoreSlot, bucketKey);
    const presentCardById = new Map<string, TCard>();
    const refile = (): void => {
        const filedEntitySlots: TCardSlot[] = [];
        for (const card of presentCardById.values()) {
            if (!isFiled(card)) continue;
            const entitySlot = entityCollectionService.findSlotByKey(entityStoreSlot, card.id);
            if (entitySlot !== undefined) filedEntitySlots.push(entitySlot);
        }
        bucketCollectionService.slotContentService.writeSlotContent(bucketSlot, filedEntitySlots);
    };
    return {
        bucketCollectionService,
        bucketSlot,
        putCards: (...cards) => {
            for (const card of cards) presentCardById.set(card.id, card);
            entityCollectionService.writeInBatch(entityStoreSlot, () => (cards).map(entity => entityCollectionService.writeSlotContentByKey(entityStoreSlot, entity.id, entity)));
            refile();
        },
        dropCard: id => {
            presentCardById.delete(id);
            const entitySlot = entityCollectionService.findSlotByKey(entityStoreSlot, id);
            if (entitySlot !== undefined) entityCollectionService.slotContentService.clearSlotContent(entitySlot);
            refile();
        },
    };
};

const allCards = (
    db: OIMDB, entityCollectionService: TCardCollectionService, entityStoreSlot: TCardStoreSlot,
): TFiling =>
    fileCards(db, entityCollectionService, entityStoreSlot, 'all', () => true);

const keptCards = (
    db: OIMDB, entityCollectionService: TCardCollectionService, entityStoreSlot: TCardStoreSlot,
): TFiling =>
    fileCards(db, entityCollectionService, entityStoreSlot, 'keep', card => !card.draft);

const sourceOf = (
    db: OIMDB,
    entityCollectionService: TCardCollectionService,
    entityStoreSlot: TCardStoreSlot,
    filing: TFiling,
): OIMPersistBucketRecordSource<TOIMStoreKey, TCard, TCardSlots> =>
    new OIMPersistBucketRecordSource<TOIMStoreKey, TCard, TCardSlots>({
        channelMap: db,
        entityCollectionService,
        entityStoreSlot,
        slotContentBucketService: filing.bucketCollectionService.slotContentService,
        bucketSlot: filing.bucketSlot,
    });

const readMemberKeys = (filing: TFiling): unknown[] =>
    Array.from(filing.bucketCollectionService.slotContentService.getBucketMemberSlots(filing.bucketSlot))
        .map(entitySlot => entitySlot.key);

describe('OIMPersistBucketRecordSource', () => {
    it('reads what the bucket holds and nothing else', () => {
        const { db, entityCollectionService, entityStoreSlot } = buildCards();
        const filing = allCards(db, entityCollectionService, entityStoreSlot);
        filing.putCards(
            { id: 'c1', deckId: 'd1', title: 'alpha', draft: false },
            { id: 'c2', deckId: 'd1', title: 'beta', draft: false },
        );
        db.flush();

        const persistRecords = sourceOf(db, entityCollectionService, entityStoreSlot, filing).readSnapshot();
        expect(persistRecords.records.map(record => record.key).sort()).toEqual(['c1', 'c2']);
        expect(persistRecords.records.find(record => record.key === 'c1')?.entity.title).toBe('alpha');
    });

    it('reports an entity whose content changed even though the members did not move', () => {
        const { db, entityCollectionService, entityStoreSlot } = buildCards();
        const filing = allCards(db, entityCollectionService, entityStoreSlot);
        filing.putCards(
            { id: 'c1', deckId: 'd1', title: 'alpha', draft: false },
            { id: 'c2', deckId: 'd1', title: 'beta', draft: false },
        );
        db.flush();

        const persistBucketRecordSource = sourceOf(db, entityCollectionService, entityStoreSlot, filing);
        const reportedKeys: TOIMStoreKey[] = [];
        persistBucketRecordSource.subscribeEntitySlotChanged(entitySlot => { reportedKeys.push(entitySlot.key); });
        expect([...reportedKeys].sort()).toEqual(['c1', 'c2']);

        entityCollectionService.slotContentService.updateEntity(
            entityCollectionService.getSlotByKey(entityStoreSlot, 'c1'), { title: 'ALPHA' },
        );
        db.flush();
        expect(reportedKeys.slice(2)).toEqual(['c1']);
        expect(persistBucketRecordSource.readSnapshot().records.find(record => record.key === 'c1')?.entity.title).toBe('ALPHA');
    });

    it('reports an arrival and a departure that land in the same frame, and reads them as an upsert and a deletion', () => {
        const { db, entityCollectionService, entityStoreSlot } = buildCards();
        const filing = allCards(db, entityCollectionService, entityStoreSlot);
        filing.putCards(
            { id: 'c1', deckId: 'd1', title: 'alpha', draft: false },
            { id: 'c2', deckId: 'd1', title: 'beta', draft: false },
        );
        db.flush();

        const persistBucketRecordSource = sourceOf(db, entityCollectionService, entityStoreSlot, filing);
        let reportedEntitySlots = new Set<TCardSlot>();
        persistBucketRecordSource.subscribeEntitySlotChanged(entitySlot => { reportedEntitySlots.add(entitySlot); });
        expect(Array.from(reportedEntitySlots, entitySlot => entitySlot.key).sort()).toEqual(['c1', 'c2']);
        reportedEntitySlots = new Set<TCardSlot>();

        filing.putCards({ id: 'c3', deckId: 'd1', title: 'gamma', draft: false });
        filing.dropCard('c2');
        db.flush();
        expect(Array.from(reportedEntitySlots, entitySlot => entitySlot.key).sort()).toEqual(['c2', 'c3']);

        const persistRecordsDelta = persistBucketRecordSource.readRecordsDelta(reportedEntitySlots);
        expect(persistRecordsDelta.upserts.map(record => record.key)).toEqual(['c3']);
        expect(persistRecordsDelta.deletedKeys).toEqual(['c2']);
    });

    it('never reports an entity that is not in the bucket, and reports it the moment it is filed', () => {
        const { db, entityCollectionService, entityStoreSlot } = buildCards();
        const filing = keptCards(db, entityCollectionService, entityStoreSlot);
        filing.putCards(
            { id: 'c1', deckId: 'd1', title: 'alpha', draft: false },
            { id: 'c2', deckId: 'd1', title: 'scratch', draft: true },
        );
        db.flush();

        const persistBucketRecordSource = sourceOf(db, entityCollectionService, entityStoreSlot, filing);
        expect(persistBucketRecordSource.readSnapshot().records.map(record => record.key)).toEqual(['c1']);

        const reportedKeys: TOIMStoreKey[] = [];
        persistBucketRecordSource.subscribeEntitySlotChanged(entitySlot => { reportedKeys.push(entitySlot.key); });
        expect(reportedKeys).toEqual(['c1']);

        filing.putCards({ id: 'c2', deckId: 'd1', title: 'scratch again', draft: true });
        db.flush();
        expect(reportedKeys).toEqual(['c1']);

        filing.putCards({ id: 'c2', deckId: 'd1', title: 'scratch again', draft: false });
        db.flush();
        expect(reportedKeys).toEqual(['c1', 'c2']);
        expect(persistBucketRecordSource.readSnapshot().records.map(record => record.key).sort()).toEqual(['c1', 'c2']);
    });

    it('round-trips a delta from one runtime onto a second, empty one', () => {
        const firstCards = buildCards();
        const firstFiling = keptCards(firstCards.db, firstCards.entityCollectionService, firstCards.entityStoreSlot);
        firstFiling.putCards(
            { id: 'c1', deckId: 'd1', title: 'alpha', draft: false },
            { id: 'c2', deckId: 'd1', title: 'beta', draft: false },
        );
        firstCards.db.flush();
        const firstPersistRecordSource = sourceOf(
            firstCards.db, firstCards.entityCollectionService, firstCards.entityStoreSlot, firstFiling,
        );
        const persistRecordsDelta = firstPersistRecordSource.readRecordsDelta(
            new Set(firstFiling.bucketCollectionService.slotContentService.getBucketMemberSlots(firstFiling.bucketSlot)),
        );

        const secondCards = buildCards();
        const secondFiling = keptCards(secondCards.db, secondCards.entityCollectionService, secondCards.entityStoreSlot);
        const secondPersistRecordSource = sourceOf(
            secondCards.db, secondCards.entityCollectionService, secondCards.entityStoreSlot, secondFiling,
        );
        secondCards.entityCollectionService.writeInBatch(secondCards.entityStoreSlot, () => (persistRecordsDelta.upserts.map(record => record.entity)).map(entity => secondCards.entityCollectionService.writeSlotContentByKey(secondCards.entityStoreSlot, entity.id, entity)));
        for (const deletedKey of persistRecordsDelta.deletedKeys) {
            const deletedEntitySlot = secondCards.entityCollectionService.findSlotByKey(secondCards.entityStoreSlot, deletedKey);
            if (deletedEntitySlot !== undefined) secondCards.entityCollectionService.slotContentService.clearSlotContent(deletedEntitySlot);
        }
        expect(readMemberKeys(secondFiling)).toEqual([]);
        secondFiling.putCards(...persistRecordsDelta.upserts.map(record => record.entity));
        secondCards.db.flush();

        const sortByKey = (records: readonly TOIMPersistRecord<TOIMStoreKey, TCard>[]): TOIMPersistRecord<TOIMStoreKey, TCard>[] =>
            [...records].sort((left, right) => String(left.key).localeCompare(String(right.key)));
        expect(sortByKey(secondPersistRecordSource.readSnapshot().records))
            .toEqual(sortByKey(firstPersistRecordSource.readSnapshot().records));
    });

    it('reads named keys as upserts of members and deletions of non-members, skipping a key no slot holds', () => {
        const { db, entityCollectionService, entityStoreSlot } = buildCards();
        const filing = keptCards(db, entityCollectionService, entityStoreSlot);
        filing.putCards(
            { id: 'c1', deckId: 'd1', title: 'alpha', draft: false },
            { id: 'c2', deckId: 'd1', title: 'scratch', draft: true },
        );
        db.flush();

        const persistRecordSource = sourceOf(db, entityCollectionService, entityStoreSlot, filing);
        const persistRecordsDelta = persistRecordSource.readRecordsDelta(
            persistRecordSource.findEntitySlotsByKeys(['c1', 'c2', 'missing']),
        );

        expect(persistRecordsDelta.upserts).toEqual([{ key: 'c1', entity: { id: 'c1', deckId: 'd1', title: 'alpha', draft: false } }]);
        expect(persistRecordsDelta.deletedKeys).toEqual(['c2']);
    });
});

describe('OIMPersistSingleEntitySnapshotSource', () => {
    const buildSession = <TEntity extends object>(entity: TEntity) => {
        const db = new OIMDB();
        const singleEntityService = createOIMSingleSlotService({ slotContentService: createOIMSlotContentEntityService<TEntity>() });
        const singleEntityStoreSlot = singleEntityService.createStoreSlot(db);
        const singleEntitySlot = singleEntityService.writeSingleSlotContent(singleEntityStoreSlot, entity);
        db.flush();
        const persistSingleEntitySnapshotSource = new OIMPersistSingleEntitySnapshotSource<TEntity>({
            channelMap: db, singleSlotService: singleEntityService, entityStoreSlot: singleEntityStoreSlot,
        });
        return { db, singleEntityService, singleEntitySlot, persistSingleEntitySnapshotSource };
    };

    it('reads and writes a single entity', () => {
        const { db, persistSingleEntitySnapshotSource } = buildSession({ userId: 'u1', theme: 'dark' });

        expect(persistSingleEntitySnapshotSource.readSnapshot()).toEqual({ userId: 'u1', theme: 'dark' });
        persistSingleEntitySnapshotSource.writeSnapshot({ userId: 'u1', theme: 'light' });
        db.flush();
        expect(persistSingleEntitySnapshotSource.readSnapshot()).toEqual({ userId: 'u1', theme: 'light' });
    });

    it('does not report its own restore, and does report the next change', () => {
        const {
            db, singleEntityService, singleEntitySlot, persistSingleEntitySnapshotSource,
        } = buildSession({ userId: 'u1', theme: 'dark' });

        persistSingleEntitySnapshotSource.writeSnapshot({ userId: 'u1', theme: 'dark' });
        db.flush();

        let changeCount = 0;
        persistSingleEntitySnapshotSource.subscribeSnapshotChanged(() => { changeCount++; });

        persistSingleEntitySnapshotSource.writeSnapshot({ userId: 'u1', theme: 'light' });
        db.flush();
        expect(changeCount).toBe(0);

        singleEntityService.slotContentService.updateEntity(singleEntitySlot, { theme: 'solarized' });
        db.flush();
        expect(changeCount).toBe(1);

        singleEntityService.slotContentService.updateEntity(singleEntitySlot, { theme: 'dark' });
        db.flush();
        expect(changeCount).toBe(2);
    });

    it('reports at the mount a single entity no restore has matched', () => {
        const { persistSingleEntitySnapshotSource } = buildSession({ userId: 'u1', theme: 'dark' });

        let changeCount = 0;
        persistSingleEntitySnapshotSource.subscribeSnapshotChanged(() => { changeCount++; });

        expect(changeCount).toBe(1);
    });

    it('a restored snapshot does not resurrect a column that was deleted before it was taken', () => {
        const { db, persistSingleEntitySnapshotSource } = buildSession<Record<string, string>>({
            userId: 'u1', theme: 'dark', impersonating: 'u2',
        });

        persistSingleEntitySnapshotSource.writeSnapshot({ userId: 'u1', theme: 'dark' });
        db.flush();

        expect(persistSingleEntitySnapshotSource.readSnapshot()).toEqual({ userId: 'u1', theme: 'dark' });
        expect(persistSingleEntitySnapshotSource.readSnapshot().impersonating).toBeUndefined();
    });

    it('a restored snapshot wakes the column it dropped and the column it moved, and no other', () => {
        const {
            db, singleEntityService, singleEntitySlot, persistSingleEntitySnapshotSource,
        } = buildSession<Record<string, string>>({
            userId: 'u1', theme: 'dark', impersonating: 'u2',
        });

        let userWakeCount = 0;
        let themeWakeCount = 0;
        let impersonatingWakeCount = 0;
        const effectService = OIMEffectService.INSTANCE;
        effectService.createEffect(db, () => { userWakeCount++; }, [singleEntityService.columnSlotService.getColumn(singleEntitySlot, 'userId')]);
        effectService.createEffect(db, () => { themeWakeCount++; }, [singleEntityService.columnSlotService.getColumn(singleEntitySlot, 'theme')]);
        effectService.createEffect(
            db, () => { impersonatingWakeCount++; }, [singleEntityService.columnSlotService.getColumn(singleEntitySlot, 'impersonating')],
        );

        persistSingleEntitySnapshotSource.writeSnapshot({ userId: 'u1', theme: 'light' });
        db.flush();

        expect(impersonatingWakeCount).toBe(1);
        expect(themeWakeCount).toBe(1);
        expect(userWakeCount).toBe(0);
        expect(persistSingleEntitySnapshotSource.readSnapshot()).toEqual({ userId: 'u1', theme: 'light' });
    });

    it('a column that leaves wakes a subscriber watching it', () => {
        const { db, singleEntityService, singleEntitySlot } = buildSession({ userId: 'u1', theme: 'dark' });
        let runCount = 0;
        OIMEffectService.INSTANCE.createEffect(
            db, () => { runCount++; }, [singleEntityService.columnSlotService.getColumn(singleEntitySlot, 'theme')],
        );

        singleEntityService.slotContentService.deleteEntityColumns(singleEntitySlot, ['theme']);
        db.flush();

        expect(runCount).toBe(1);
        expect(singleEntitySlot.entity).toEqual({ userId: 'u1' });
    });
});

describe('hydrating a bucket', () => {
    it('restores the entities and the members the snapshot carried', () => {
        const originCards = buildCards();
        const originFiling = keptCards(originCards.db, originCards.entityCollectionService, originCards.entityStoreSlot);
        originFiling.putCards(
            { id: 'c1', deckId: 'd1', title: 'alpha', draft: false },
            { id: 'c2', deckId: 'd1', title: 'scratch', draft: true },
            { id: 'c3', deckId: 'd1', title: 'gamma', draft: false },
        );
        originCards.db.flush();
        const persistRecords = sourceOf(
            originCards.db, originCards.entityCollectionService, originCards.entityStoreSlot, originFiling,
        ).readSnapshot();
        expect(persistRecords.records.map(record => record.key)).toEqual(['c1', 'c3']);

        const restoredCards = buildCards();
        const restoredFiling = keptCards(restoredCards.db, restoredCards.entityCollectionService, restoredCards.entityStoreSlot);
        sourceOf(
            restoredCards.db, restoredCards.entityCollectionService, restoredCards.entityStoreSlot, restoredFiling,
        ).writeSnapshot(persistRecords);
        restoredCards.db.flush();

        expect(readMemberKeys(restoredFiling)).toEqual(['c1', 'c3']);
        expect(
            restoredCards.entityCollectionService.findSlotByKey(restoredCards.entityStoreSlot, 'c1')?.entity?.title,
        ).toBe('alpha');
    });

    it('re-writing the snapshot a group already holds touches nothing and wakes nobody', () => {
        const { db, entityCollectionService, entityStoreSlot } = buildCards();
        const filing = keptCards(db, entityCollectionService, entityStoreSlot);
        filing.putCards(
            { id: 'c1', deckId: 'd1', title: 'alpha', draft: false },
            { id: 'c2', deckId: 'd1', title: 'scratch', draft: true },
            { id: 'c3', deckId: 'd1', title: 'gamma', draft: false },
        );
        db.flush();
        const persistBucketRecordSource = sourceOf(db, entityCollectionService, entityStoreSlot, filing);
        const persistRecords = persistBucketRecordSource.readSnapshot();

        let runCount = 0;
        OIMEffectService.INSTANCE.createEffect(db, () => { runCount++; }, [filing.bucketSlot]);

        persistBucketRecordSource.writeSnapshot(persistRecords);
        db.flush();

        expect(runCount).toBe(0);
        expect(readMemberKeys(filing)).toEqual(['c1', 'c3']);
    });

    it('replaces the members with a snapshot narrower than the group it lands in', () => {
        const { db, entityCollectionService, entityStoreSlot } = buildCards();
        const filing = keptCards(db, entityCollectionService, entityStoreSlot);
        filing.putCards(
            { id: 'c1', deckId: 'd1', title: 'alpha', draft: false },
            { id: 'c2', deckId: 'd1', title: 'beta', draft: false },
        );
        db.flush();

        sourceOf(db, entityCollectionService, entityStoreSlot, filing).writeSnapshot({
            records: [{ key: 'c1', entity: { id: 'c1', deckId: 'd1', title: 'ALPHA', draft: false } }],
        });
        db.flush();

        expect(entityCollectionService.findSlotByKey(entityStoreSlot, 'c1')?.entity?.title).toBe('ALPHA');
        expect(readMemberKeys(filing)).toEqual(['c1']);
        expect(entityCollectionService.findSlotByKey(entityStoreSlot, 'c2')?.entity?.title).toBe('beta');
    });
});

describe('hydrating a bucket that holds the whole collection', () => {
    it('replaces its members too, and leaves the unmentioned entities in the collection', () => {
        const { db, entityCollectionService, entityStoreSlot } = buildCards();
        const filing = allCards(db, entityCollectionService, entityStoreSlot);
        filing.putCards(
            { id: 'c1', deckId: 'd1', title: 'alpha', draft: false },
            { id: 'c2', deckId: 'd1', title: 'beta', draft: false },
        );
        db.flush();

        sourceOf(db, entityCollectionService, entityStoreSlot, filing).writeSnapshot({
            records: [{ key: 'c1', entity: { id: 'c1', deckId: 'd1', title: 'ALPHA', draft: false } }],
        });
        db.flush();

        expect(entityCollectionService.findSlotByKey(entityStoreSlot, 'c1')?.entity?.title).toBe('ALPHA');
        expect(readMemberKeys(filing)).toEqual(['c1']);
        expect(entityCollectionService.findSlotByKey(entityStoreSlot, 'c2')?.entity?.title).toBe('beta');
    });
});

describe('hydrating a list of members nothing but the snapshot knows', () => {
    it('restores a bucket whose order and members came from a server', () => {
        type TDoc = { id: string; title: string };
        type TDocSlot = TOIMEntitySlot<TDoc, TOIMStoreKey>;
        type TDocSlots = TOIMBucketSlotsArrayStore<TDocSlot>;
        const buildSearch = () => {
            const db = new OIMDB();
            const entityCollectionService = createOIMSlotCollectionService({ slotContentService: createOIMSlotContentEntityService<TDoc>() });
            const entityStoreSlot = entityCollectionService.createStoreSlot(db);
            const bucketCollectionService = createOIMSlotCollectionService({ slotContentService: new OIMSlotContentPositionalArrayBucketService<TDocSlot>({ bucketCommands: new OIMBucketCommands({ maxCommandsPerSlot: undefined }) }) });
            const bucketStoreSlot = bucketCollectionService.createStoreSlot(db);
            const bucketSlot = bucketCollectionService.holdSlotByKey(bucketStoreSlot, 'results');
            const persistBucketRecordSource = new OIMPersistBucketRecordSource<TOIMStoreKey, TDoc, TDocSlots>({
                channelMap: db,
                entityCollectionService,
                entityStoreSlot,
                slotContentBucketService: bucketCollectionService.slotContentService,
                bucketSlot,
            });
            return {
                db, entityCollectionService, entityStoreSlot, bucketCollectionService, bucketSlot, persistBucketRecordSource,
            };
        };

        const originSearch = buildSearch();
        const firstEntitySlot = originSearch.entityCollectionService.writeSlotContentByKey(originSearch.entityStoreSlot, 'c1', { id: 'c1', title: 'alpha' });
        originSearch.entityCollectionService.writeSlotContentByKey(originSearch.entityStoreSlot, 'c2', { id: 'c2', title: 'beta' });
        const thirdEntitySlot = originSearch.entityCollectionService.writeSlotContentByKey(originSearch.entityStoreSlot, 'c3', { id: 'c3', title: 'gamma' });
        originSearch.db.flush();
        originSearch.bucketCollectionService.slotContentService.writeSlotContent(
            originSearch.bucketSlot, [thirdEntitySlot, firstEntitySlot],
        );
        originSearch.db.flush();

        const persistRecords = originSearch.persistBucketRecordSource.readSnapshot();
        expect(persistRecords.records.map(record => record.key)).toEqual(['c3', 'c1']);

        const restoredSearch = buildSearch();
        restoredSearch.persistBucketRecordSource.writeSnapshot(persistRecords);
        restoredSearch.db.flush();

        expect(
            Array.from(restoredSearch.bucketCollectionService.slotContentService.getBucketMemberSlots(restoredSearch.bucketSlot))
                .map(entitySlot => String(entitySlot.key)),
        ).toEqual(['c3', 'c1']);
        expect(
            restoredSearch.entityCollectionService.findSlotByKey(restoredSearch.entityStoreSlot, 'c1')?.entity?.title,
        ).toBe('alpha');
    });
});

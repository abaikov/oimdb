import { OIMDB } from '../../db/OIMDB';
import { OIMSlotCollectionBucketService } from '../OIMSlotCollectionBucketService';
import { createOIMEntitySlotCollectionStoreAggregate } from '../../entity/createOIMEntitySlotCollectionStoreAggregate';
import { oimIsSlotReleased } from '../../slot/utils/oimIsSlotReleased';
import { createOIMSlotCollectionIndexStoreAggregate } from '../../index/createOIMSlotCollectionIndexStoreAggregate';

type TCard = { id: string; title: string; rank: number };

const collectionBucketService = OIMSlotCollectionBucketService.INSTANCE;

const createFixture = () => {
    const db = new OIMDB();
    const cards = createOIMEntitySlotCollectionStoreAggregate<TCard>(db);
    cards.writeSlotContentByKey('a', { id: 'a', title: 'Ace', rank: 1 });
    cards.writeSlotContentByKey('b', { id: 'b', title: 'Two', rank: 2 });
    db.flush();
    let rankRuns = 0;
    const rankColumn = collectionBucketService.holdBucketColumn(cards.storeSlot, 'rank');
    const stopRankEffect = db.createEffect(() => { rankRuns++; }, [rankColumn]);
    db.flush();
    return { db, cards, rankColumn, stopRankEffect, rankRuns: () => rankRuns };
};

describe('what a collection list column hears', () => {
    it('wakes when a member changes that column, and not for another column', () => {
        const { db, cards, rankRuns } = createFixture();
        const runsBefore = rankRuns();
        cards.getSlotByKey('a').updateEntity({ title: 'Ace of spades' });
        db.flush();
        expect(rankRuns()).toBe(runsBefore);
        cards.getSlotByKey('b').updateEntity({ rank: 0 });
        db.flush();
        expect(rankRuns()).toBe(runsBefore + 1);
    });

    it('wakes for a change made inside a batch', () => {
        const { db, cards, rankRuns } = createFixture();
        const runsBefore = rankRuns();
        cards.writeInBatch(() => {
            cards.getSlotByKey('a').updateEntity({ rank: 5 });
            cards.getSlotByKey('b').updateEntity({ rank: 6 });
        });
        db.flush();
        expect(rankRuns()).toBe(runsBefore + 1);
    });

    it('wakes the any-column slot for a change of any column of a member', () => {
        const { db, cards } = createFixture();
        let anyRuns = 0;
        db.createEffect(() => { anyRuns++; }, [collectionBucketService.holdAnyBucketColumn(cards.storeSlot)]);
        db.flush();
        const runsBefore = anyRuns;
        cards.getSlotByKey('a').updateEntity({ title: 'Ace of spades' });
        db.flush();
        expect(anyRuns).toBe(runsBefore + 1);
    });

    it('costs a collection nobody reads by column nothing: no listener on its store slot', () => {
        const db = new OIMDB();
        const cards = createOIMEntitySlotCollectionStoreAggregate<TCard>(db);
        cards.writeSlotContentByKey('a', { id: 'a', title: 'Ace', rank: 1 });
        collectionBucketService.getBucketSlot(cards.storeSlot);
        db.flush();
        expect(cards.storeSlot.contentChangeListeners?.length ?? 0).toBe(0);
    });

    it('takes its listener off the collection when the list goes, so writes are back on the fast path', () => {
        const { db, cards, rankColumn, stopRankEffect } = createFixture();
        expect(cards.storeSlot.contentChangeListeners?.length).toBe(1);
        stopRankEffect();
        const bucketSlot = collectionBucketService.getBucketSlot(cards.storeSlot);
        rankColumn.unholdSlot();
        db.flush();
        expect(oimIsSlotReleased(bucketSlot)).toBe(true);
        expect(cards.storeSlot.contentChangeListeners?.length ?? 0).toBe(0);
        expect(cards.storeSlot.columnListenerCountsByColumnName?.size ?? 0).toBe(0);
    });

    it('stays quiet for a column it does not read even when an index on the same collection hears every column', () => {
        const { db, cards, rankRuns } = createFixture();
        createOIMSlotCollectionIndexStoreAggregate(cards, { keyOf: (card) => card.title.length });
        db.flush();
        const runsBefore = rankRuns();
        cards.getSlotByKey('a').updateEntity({ title: 'Ace of spades' });
        db.flush();
        expect(rankRuns()).toBe(runsBefore);
    });
});

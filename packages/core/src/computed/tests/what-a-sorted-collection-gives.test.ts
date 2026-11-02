import { OIMDB } from '../../db/OIMDB';
import { createOIMEntitySlotCollectionStoreAggregate } from '../../entity/createOIMEntitySlotCollectionStoreAggregate';
import { createOIMSortedCollectionSingleSlotStoreAggregate } from '../createOIMSortedCollectionSingleSlotStoreAggregate';

type TCard = { id: string; title: string; rank: number };

const createFixture = () => {
    const db = new OIMDB();
    const cards = createOIMEntitySlotCollectionStoreAggregate<TCard>(db);
    cards.writeSlotContentByKey('a', { id: 'a', title: 'Ace', rank: 3 });
    cards.writeSlotContentByKey('b', { id: 'b', title: 'Two', rank: 1 });
    cards.writeSlotContentByKey('c', { id: 'c', title: 'Three', rank: 2 });
    db.flush();
    const byRank = createOIMSortedCollectionSingleSlotStoreAggregate(cards, { sortColumns: [{ columnName: 'rank', direction: 'asc' }] });
    const orders: string[][] = [];
    const stop = db.createEffect(() => { orders.push(byRank.getSingleSlot().value.map((card) => card.key as string)); });
    db.flush();
    return { db, cards, byRank, orders, stop };
};

describe('what a sorted collection gives', () => {
    it('lists every entity of the collection in sort order, with no index', () => {
        const { orders } = createFixture();
        expect(orders).toEqual([['b', 'c', 'a']]);
    });

    it('reorders on a write to the sort column, and keeps arrivals and departures in order', () => {
        const { db, cards, orders } = createFixture();
        cards.getSlotByKey('a').updateEntity({ rank: 0 });
        db.flush();
        cards.writeSlotContentByKey('d', { id: 'd', title: 'Four', rank: 1.5 });
        db.flush();
        cards.getSlotByKey('c').clearSlotContent();
        db.flush();
        expect(orders).toEqual([['b', 'c', 'a'], ['a', 'b', 'c'], ['a', 'b', 'd', 'c'], ['a', 'b', 'd']]);
    });

    it('does not wake its reader for a write to a column it does not sort by', () => {
        const { db, cards, orders } = createFixture();
        cards.getSlotByKey('a').updateEntity({ title: 'Ace of spades' });
        db.flush();
        expect(orders).toEqual([['b', 'c', 'a']]);
    });

    it('sorts by a comparator and re-sorts on any column', () => {
        const db = new OIMDB();
        const cards = createOIMEntitySlotCollectionStoreAggregate<TCard>(db);
        cards.writeSlotContentByKey('a', { id: 'a', title: 'Ace', rank: 3 });
        cards.writeSlotContentByKey('b', { id: 'b', title: 'Two', rank: 1 });
        db.flush();
        const byTitle = createOIMSortedCollectionSingleSlotStoreAggregate(cards, { comparator: (left, right) => left.title.localeCompare(right.title) });
        const orders: string[][] = [];
        db.createEffect(() => { orders.push(byTitle.getSingleSlot().value.map((card) => card.key as string)); });
        db.flush();
        cards.getSlotByKey('b').updateEntity({ title: 'Aardvark' });
        db.flush();
        expect(orders).toEqual([['a', 'b'], ['b', 'a']]);
    });

    it('lets the collection go back to the fast path when nobody reads it any more', () => {
        const { db, cards, stop } = createFixture();
        expect(cards.storeSlot.contentChangeListeners?.length).toBe(1);
        stop();
        db.flush();
        db.flush();
        expect(cards.storeSlot.contentChangeListeners?.length ?? 0).toBe(0);
    });
});

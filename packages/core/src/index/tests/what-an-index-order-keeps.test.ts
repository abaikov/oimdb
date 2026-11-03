import { OIMDB } from '../../db/OIMDB';
import { OIMEffectService } from '../../effect/OIMEffectService';
import { createOIMSlotCollectionIndexService } from '../createOIMSlotCollectionIndexService';
import { createOIMSortedComputedService } from '../../computed/createOIMSortedComputedService';
import type { TOIMSortColumn } from '../../computed/types/TOIMSortColumn';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';
import { readValueWithoutTracking } from '../../../tests/support/readValueWithoutTracking';

type TCard = { id: string; deck: string; rank: number; label: string };

type TSorter = {
    sortColumns?: readonly TOIMSortColumn<TCard>[];
    comparator?: (left: TCard, right: TCard) => number;
};

const createFixture = (sorter: TSorter) => {
    const db = new OIMDB();
    const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard, string>() });
    const cards = cardsService.createStoreSlot(db);
    const byDeckService = createOIMSlotCollectionIndexService({
        entityService: cardsService,
        keyOf: (card: TCard) => card.deck,
    });
    const byDeck = byDeckService.createIndexStoreSlot(cards);
    const ordersService = createOIMSortedComputedService({ indexService: byDeckService, ...sorter });
    const orders = ordersService.createSortedStoreSlot(byDeck);
    const order = ordersService.holdSlotByKey(orders, 'spades');
    const idsInOrder = (): string[] => readValueWithoutTracking(order).map(slot => slot.entity?.id ?? '');
    const updateEntityByKey = (key: string, patch: Partial<TCard>): void => {
        const slot = cardsService.peekSlotByKey(cards, key);
        if (slot !== undefined) cardsService.slotContentService.updateEntity(slot, patch);
    };
    const deleteEntityByKey = (key: string): void => {
        const slot = cardsService.peekSlotByKey(cards, key);
        if (slot !== undefined) cardsService.slotContentService.clearSlotContent(slot);
    };
    return {
        db, cards, cardsService, byDeck, byDeckService, orders, ordersService, order, idsInOrder, updateEntityByKey, deleteEntityByKey,
    };
};

const byRankThenId: TSorter = {
    sortColumns: [{ columnName: 'rank', direction: 'asc' }, { columnName: 'id', direction: 'asc' }],
};

const countingByRank = () => {
    const counter = { compared: 0 };
    const sorter: TSorter = {
        sortColumns: [{ columnName: 'rank', direction: 'asc' }],
        comparator: (left, right) => {
            counter.compared++;
            return left.rank - right.rank;
        },
    };
    return { counter, sorter };
};

const createSeed = (): TCard[] => [
    { id: 'c3', deck: 'spades', rank: 30, label: 'three' },
    { id: 'c1', deck: 'spades', rank: 10, label: 'one' },
    { id: 'c2', deck: 'spades', rank: 20, label: 'two' },
    { id: 'h1', deck: 'hearts', rank: 5, label: 'heart' },
];

describe('an index order', () => {
    let seed: TCard[];

    beforeEach(() => {
        seed = createSeed();
    });

    it('reads the entity slots of its key sorted by the sorter columns', () => {
        const { cards, cardsService, idsInOrder } = createFixture(byRankThenId);
        cardsService.writeInBatch(cards, () => (seed).map(entity => cardsService.writeSlotContentByKey(cards, entity.id, entity)));
        expect(idsInOrder()).toEqual(['c1', 'c2', 'c3']);
    });

    it('sorts descending when the column says so', () => {
        const { cards, cardsService, idsInOrder } = createFixture({ sortColumns: [{ columnName: 'rank', direction: 'desc' }] });
        cardsService.writeInBatch(cards, () => (seed).map(entity => cardsService.writeSlotContentByKey(cards, entity.id, entity)));
        expect(idsInOrder()).toEqual(['c3', 'c2', 'c1']);
    });

    it('puts an entity back in order when a patch moves its sort column', () => {
        const { cards, cardsService, idsInOrder, updateEntityByKey } = createFixture(byRankThenId);
        cardsService.writeInBatch(cards, () => (seed).map(entity => cardsService.writeSlotContentByKey(cards, entity.id, entity)));
        expect(idsInOrder()).toEqual(['c1', 'c2', 'c3']);
        updateEntityByKey('c3', { rank: 5 });
        expect(idsInOrder()).toEqual(['c3', 'c1', 'c2']);
    });

    it('does not sort again for a patch that touches no sort column', () => {
        const { counter, sorter } = countingByRank();
        const { cards, cardsService, order, idsInOrder, updateEntityByKey } = createFixture(sorter);
        cardsService.writeInBatch(cards, () => (seed).map(entity => cardsService.writeSlotContentByKey(cards, entity.id, entity)));
        const before = readValueWithoutTracking(order);
        expect(idsInOrder()).toEqual(['c1', 'c2', 'c3']);
        counter.compared = 0;
        updateEntityByKey('c2', { label: 'deuce' });
        expect(readValueWithoutTracking(order)).toBe(before);
        expect(counter.compared).toBe(0);
    });

    it('takes an entity in when its key arrives and lets it go when its key leaves', () => {
        const { cards, cardsService, idsInOrder, updateEntityByKey, deleteEntityByKey } = createFixture(byRankThenId);
        cardsService.writeInBatch(cards, () => (seed).map(entity => cardsService.writeSlotContentByKey(cards, entity.id, entity)));
        expect(idsInOrder()).toEqual(['c1', 'c2', 'c3']);
        updateEntityByKey('h1', { deck: 'spades' });
        expect(idsInOrder()).toEqual(['h1', 'c1', 'c2', 'c3']);
        updateEntityByKey('c1', { deck: 'hearts' });
        expect(idsInOrder()).toEqual(['h1', 'c2', 'c3']);
        deleteEntityByKey('c2');
        expect(idsInOrder()).toEqual(['h1', 'c3']);
    });

    it('holds no entity that arrived and left again before it was read', () => {
        const { cards, cardsService, idsInOrder, updateEntityByKey } = createFixture(byRankThenId);
        cardsService.writeInBatch(cards, () => (seed).map(entity => cardsService.writeSlotContentByKey(cards, entity.id, entity)));
        expect(idsInOrder()).toEqual(['c1', 'c2', 'c3']);
        updateEntityByKey('h1', { deck: 'spades' });
        updateEntityByKey('h1', { deck: 'hearts' });
        expect(idsInOrder()).toEqual(['c1', 'c2', 'c3']);
    });

    it('sorts a batch upsert of entities it already holds', () => {
        const { cards, cardsService, idsInOrder } = createFixture(byRankThenId);
        cardsService.writeInBatch(cards, () => (seed).map(entity => cardsService.writeSlotContentByKey(cards, entity.id, entity)));
        expect(idsInOrder()).toEqual(['c1', 'c2', 'c3']);
        cardsService.writeInBatch(cards, () => ([
            { id: 'c1', deck: 'spades', rank: 40, label: 'one' },
            { id: 'c2', deck: 'spades', rank: 35, label: 'two' },
        ]).map(entity => cardsService.writeSlotContentByKey(cards, entity.id, entity)));
        expect(idsInOrder()).toEqual(['c3', 'c2', 'c1']);
    });

    it('hears a hand mutation through the columns it is told, and sorts on no columns at all', () => {
        const { counter, sorter } = countingByRank();
        const { cards, cardsService, order, idsInOrder } = createFixture(sorter);
        cardsService.writeInBatch(cards, () => (seed).map(entity => cardsService.writeSlotContentByKey(cards, entity.id, entity)));
        expect(idsInOrder()).toEqual(['c1', 'c2', 'c3']);
        const c3 = cardsService.getSlotByKey(cards, 'c3');
        const before = readValueWithoutTracking(order);
        counter.compared = 0;

        c3.entity!.label = 'trey';
        cardsService.slotContentService.markEntityChanged(c3, ['label']);
        expect(readValueWithoutTracking(order)).toBe(before);
        expect(counter.compared).toBe(0);

        c3.entity!.rank = 1;
        cardsService.slotContentService.markEntityChanged(c3, ['rank']);
        expect(idsInOrder()).toEqual(['c3', 'c1', 'c2']);

        c3.entity!.rank = 99;
        cardsService.slotContentService.markEntityChanged(c3);
        expect(idsInOrder()).toEqual(['c1', 'c2', 'c3']);
    });

    it('wakes the order and not the bucket subscriber when a rank moves inside the key', () => {
        const { db, cards, cardsService, byDeck, byDeckService, order, idsInOrder, updateEntityByKey } = createFixture(byRankThenId);
        cardsService.writeInBatch(cards, () => (seed).map(entity => cardsService.writeSlotContentByKey(cards, entity.id, entity)));
        db.flush();
        const bucket = byDeckService.holdSlotByKey(byDeck, 'spades');
        let bucketRuns = 0;
        let orderRuns = 0;
        OIMEffectService.INSTANCE.createEffect(db, () => { bucketRuns++; }, [bucket]);
        OIMEffectService.INSTANCE.createEffect(db, () => { orderRuns++; }, [], [order]);
        db.flush();
        bucketRuns = 0;
        orderRuns = 0;

        updateEntityByKey('c3', { rank: 5 });
        db.flush();
        expect(idsInOrder()).toEqual(['c3', 'c1', 'c2']);
        expect(orderRuns).toBe(1);
        expect(bucketRuns).toBe(0);
        bucket.owner.unholdSlot(bucket);
    });

    it('keeps the order of a key nobody holds out of the work', () => {
        const { counter, sorter } = countingByRank();
        const { cards, cardsService, order, updateEntityByKey } = createFixture(sorter);
        order.owner.unholdSlot(order);
        cardsService.writeInBatch(cards, () => (seed).map(entity => cardsService.writeSlotContentByKey(cards, entity.id, entity)));
        updateEntityByKey('c3', { rank: 1 });
        expect(counter.compared).toBe(0);
    });
});

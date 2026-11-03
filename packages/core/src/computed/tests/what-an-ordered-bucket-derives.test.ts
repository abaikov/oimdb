import { OIMDB } from '../../db/OIMDB';
import { OIMEffectService } from '../../effect/OIMEffectService';
import { OIMUnusedSlotCollectorService } from '../../collector/OIMUnusedSlotCollectorService';
import { OIMPositionalArrayBucketContentService } from '../../bucket/OIMPositionalArrayBucketContentService';
import { createOIMSlotCollectionIndexService } from '../../index/createOIMSlotCollectionIndexService';
import { createOIMBucketMemoComputedService } from '../createOIMBucketMemoComputedService';
import { createOIMSortedComputedService } from '../createOIMSortedComputedService';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import { isOIMSlotReleased } from '../../slot/utils/isOIMSlotReleased';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';
import { readValueWithoutTracking } from '../../../tests/support/readValueWithoutTracking';

type Card = { id: string; deck: string; rank: number };
type TCardSlotInBucket = TOIMEntitySlot<Card>;

const createFixture = () => {
    const db = new OIMDB();
    let compared = 0;
    const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<Card>() });
    const cards = cardsService.createStoreSlot(db);
    const byDeckService = createOIMSlotCollectionIndexService({
        entityService: cardsService,
        selectKey: (card: Card) => card.deck,
    });
    const byDeck = byDeckService.createIndexStoreSlot(cards);
    const ordersService = createOIMSortedComputedService({
        indexService: byDeckService,
        sortColumns: [{ columnName: 'rank', direction: 'asc' }],
        comparator: (left: Card, right: Card) => {
            compared++;
            return left.rank - right.rank;
        },
    });
    const orders = ordersService.createSortedStoreSlot(byDeck);
    const put = (...cardsToPut: { id: string; rank: number }[]): void => {
        cardsService.writeInBatch(cards, () => (cardsToPut.map(card => ({ ...card, deck: 'deck' }))).map(entity => cardsService.writeSlotContentByKey(cards, entity.id, entity)));
    };
    const updateEntityByKey = (key: string, patch: Partial<Card>): void => {
        const slot = cardsService.peekSlotByKey(cards, key);
        if (slot !== undefined) cardsService.slotContentService.updateEntity(slot, patch);
    };
    return {
        db, cards, cardsService, byDeck, byDeckService, orders, ordersService, put, updateEntityByKey,
        comparisons: (): number => compared,
    };
};

const idsOf = (slots: readonly TCardSlotInBucket[]): (string | undefined)[] =>
    slots.map((slot) => slot.entity?.id);

describe('the order of a key is derived, and the read is what derives it', () => {
    it('hands back the slots in the sorter\'s order', () => {
        const { ordersService, orders, put } = createFixture();
        const heldSlot = ordersService.holdSlotByKey(orders, 'deck');
        put({ id: 'c', rank: 30 }, { id: 'a', rank: 10 }, { id: 'b', rank: 20 });

        expect(idsOf(readValueWithoutTracking(heldSlot))).toEqual(['a', 'b', 'c']);

        heldSlot.owner.unholdSlot(heldSlot);
    });

    it('derives nothing at all while nobody reads it', () => {
        const { ordersService, orders, put, comparisons } = createFixture();
        const heldSlot = ordersService.holdSlotByKey(orders, 'deck');
        put({ id: 'c', rank: 30 }, { id: 'a', rank: 10 }, { id: 'b', rank: 20 });

        expect(comparisons()).toBe(0);

        heldSlot.owner.unholdSlot(heldSlot);
    });

    it('keeps the same list, by identity, for as long as the order holds', () => {
        const { ordersService, orders, put } = createFixture();
        const heldSlot = ordersService.holdSlotByKey(orders, 'deck');
        put({ id: 'a', rank: 10 }, { id: 'b', rank: 20 });

        const first = readValueWithoutTracking(heldSlot);
        const again = readValueWithoutTracking(heldSlot);

        expect(again).toBe(first);

        heldSlot.owner.unholdSlot(heldSlot);
    });

    it('reads the bucket and its sort column, and those sources do not grow with the bucket\'s slots', () => {
        const { byDeck, byDeckService, ordersService, orders, put } = createFixture();
        const heldSlot = ordersService.holdSlotByKey(orders, 'deck');
        const bucketSlot = byDeckService.getSlotByKey(byDeck, 'deck');
        const bucketRankColumnSlot = byDeckService.getBucketColumnSlotByKey(byDeck, 'deck', 'rank');

        expect(heldSlot.sourceSlots.length).toBe(2);
        expect(heldSlot.sourceSlots[0]).toBe(bucketSlot);
        expect(heldSlot.sourceSlots[1]).toBe(bucketRankColumnSlot);
        expect(heldSlot.sourceComputeds.length).toBe(0);

        put(...Array.from({ length: 64 }, (_unused, at) => ({ id: `k${at}`, rank: 64 - at })));

        expect(heldSlot.sourceSlots.length).toBe(2);
        expect(heldSlot.sourceSlots[0]).toBe(bucketSlot);
        expect(heldSlot.sourceSlots[1]).toBe(bucketRankColumnSlot);

        heldSlot.owner.unholdSlot(heldSlot);
    });
});

describe('a subscriber is woken by the bucket and run only when the list changed', () => {
    it('does not run the body for a sort key that changed without changing the list', () => {
        const { db, updateEntityByKey, ordersService, orders, put } = createFixture();
        const heldSlot = ordersService.holdSlotByKey(orders, 'deck');

        let ran = 0;
        const effect = OIMEffectService.INSTANCE.createEffect(db, () => { ran++; }, [], [heldSlot]);
        put({ id: 'a', rank: 10 }, { id: 'b', rank: 20 }, { id: 'c', rank: 30 });
        db.flush();
        expect(ran).toBe(1);
        expect(idsOf(readValueWithoutTracking(heldSlot))).toEqual(['a', 'b', 'c']);

        updateEntityByKey('b', { rank: 25 });
        db.flush();

        expect(ran).toBe(1);
        expect(idsOf(readValueWithoutTracking(heldSlot))).toEqual(['a', 'b', 'c']);

        OIMEffectService.INSTANCE.disposeEffect(effect);
        heldSlot.owner.unholdSlot(heldSlot);
    });

    it('runs the body when the same write does change the list', () => {
        const { db, updateEntityByKey, ordersService, orders, put } = createFixture();
        const heldSlot = ordersService.holdSlotByKey(orders, 'deck');

        let ran = 0;
        const effect = OIMEffectService.INSTANCE.createEffect(db, () => { ran++; }, [], [heldSlot]);
        put({ id: 'a', rank: 10 }, { id: 'b', rank: 20 }, { id: 'c', rank: 30 });
        db.flush();
        expect(ran).toBe(1);

        updateEntityByKey('b', { rank: 99 });
        db.flush();

        expect(ran).toBe(2);
        expect(idsOf(readValueWithoutTracking(heldSlot))).toEqual(['a', 'c', 'b']);

        OIMEffectService.INSTANCE.disposeEffect(effect);
        heldSlot.owner.unholdSlot(heldSlot);
    });

    it('runs the body when the key\'s entity slots changed, and not when they did not', () => {
        const { db, ordersService, orders, put } = createFixture();
        const heldSlot = ordersService.holdSlotByKey(orders, 'deck');

        let ran = 0;
        const effect = OIMEffectService.INSTANCE.createEffect(db, () => { ran++; }, [], [heldSlot]);
        put({ id: 'a', rank: 10 }, { id: 'b', rank: 20 });
        db.flush();
        expect(ran).toBe(1);

        put({ id: 'b', rank: 20 }, { id: 'a', rank: 10 });
        db.flush();
        expect(ran).toBe(1);

        put({ id: 'd', rank: 15 });
        db.flush();
        expect(ran).toBe(2);
        expect(idsOf(readValueWithoutTracking(heldSlot))).toEqual(['a', 'd', 'b']);

        OIMEffectService.INSTANCE.disposeEffect(effect);
        heldSlot.owner.unholdSlot(heldSlot);
    });

    it('says nothing to a subscriber that arrived after the write, and still reads sorted', () => {
        const { db, ordersService, orders, put } = createFixture();
        const heldSlot = ordersService.holdSlotByKey(orders, 'deck');

        put({ id: 'c', rank: 30 }, { id: 'a', rank: 10 }, { id: 'b', rank: 20 });
        let ran = 0;
        const effect = OIMEffectService.INSTANCE.createEffect(db, () => { ran++; }, [], [heldSlot]);
        db.flush();

        expect(ran).toBe(0);
        expect(idsOf(readValueWithoutTracking(heldSlot))).toEqual(['a', 'b', 'c']);

        OIMEffectService.INSTANCE.disposeEffect(effect);
        heldSlot.owner.unholdSlot(heldSlot);
    });
});

describe('what a derivation lets go of', () => {
    it('gives the bucket back when the last reader leaves', () => {
        const db = new OIMDB();
        const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<Card>() });
        const cards = cardsService.createStoreSlot(db);
        const rankedService = createOIMSlotCollectionService({ slotContentService: new OIMPositionalArrayBucketContentService<TCardSlotInBucket, string>() });
        const ranked = rankedService.createStoreSlot(db);
        const orderService = createOIMBucketMemoComputedService({ bucketCollectionService: rankedService });
        const order = orderService.createBucketMemoStoreSlot(ranked);
        const heldSlot = orderService.holdSlotByKey(order, 'deck');
        const bucket = rankedService.getSlotByKey(ranked, 'deck');
        rankedService.slotContentService.writeSlotContent(
            bucket, [cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', deck: 'deck', rank: 10 })],
        );
        expect(readValueWithoutTracking(heldSlot).length).toBe(1);

        OIMUnusedSlotCollectorService.INSTANCE.flush(db.collectorSlot.unusedSlotCollectorSlot);
        expect(bucket.holdCount).toBeGreaterThan(0);
        expect(orderService.getSlotByKey(order, 'deck')).toBe(heldSlot);

        rankedService.slotContentService.clearSlotContent(bucket);
        heldSlot.owner.unholdSlot(heldSlot);

        expect(isOIMSlotReleased(heldSlot)).toBe(true);
        expect(isOIMSlotReleased(bucket)).toBe(true);
        expect(orderService.getSlotCount(order)).toBe(0);
        expect(rankedService.getSlotCount(ranked)).toBe(0);
    });
});

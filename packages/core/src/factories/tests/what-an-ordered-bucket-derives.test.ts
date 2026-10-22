import { OIMDB } from '../OIMDB';
import { OIMEffectService } from '../../engine/computed/OIMEffectService';
import { OIMUnusedSlotCollectorService } from '../../engine/collector/OIMUnusedSlotCollectorService';
import { OIMSlotContentBucketServiceArrayDriven } from '../../facade/bucket/OIMSlotContentBucketServiceArrayDriven';
import { createOIMBucketService } from '../createOIMBucketService';
import { createOIMEntityService } from '../createOIMEntityService';
import { createOIMIndexService } from '../createOIMIndexService';
import { createOIMComputedServiceBucketMemo } from '../createOIMComputedServiceBucketMemo';
import { createOIMComputedServiceSorted } from '../createOIMComputedServiceSorted';
import type { TOIMEntitySlot } from '../../engine/entity/types/TOIMEntitySlot';
import type { TOIMBucketSlotsArrayStore } from '../../engine/bucket/array/types/TOIMBucketSlotsArrayStore';
import { oimIsSlotReleased } from '../../engine/slot/utils/oimIsSlotReleased';

type Card = { id: string; deck: string; rank: number };
type TCardSlotInBucket = TOIMEntitySlot<Card>;

const createFixture = () => {
    const db = new OIMDB();
    let compared = 0;
    const cardsService = createOIMEntityService<Card>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    const byDeckService = createOIMIndexService(db, {
        entityService: cardsService,
        keyOf: (card: Card) => card.deck,
    });
    const byDeck = byDeckService.createIndexStoreSlot(cards);
    const ordersService = createOIMComputedServiceSorted({
        indexService: byDeckService,
        sortColumns: [{ column: 'rank', direction: 'asc' }],
        comparator: (left: Card, right: Card) => {
            compared++;
            return left.rank - right.rank;
        },
    });
    const orders = ordersService.createSortedStoreSlot(byDeck);
    const put = (...cardsToPut: { id: string; rank: number }[]): void => {
        cardsService.slotContentService.upsertEntities(cards, cardsToPut.map(card => ({ ...card, deck: 'deck' })));
    };
    const updateEntityByKey = (key: string, patch: Partial<Card>): void => {
        const slot = cardsService.findSlotByKey(cards, key);
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
        const heldSlot = ordersService.computedCollectionService.holdSlotByKey(orders, 'deck');
        put({ id: 'c', rank: 30 }, { id: 'a', rank: 10 }, { id: 'b', rank: 20 });

        expect(idsOf(heldSlot.computedValueService.getValueForSlot(heldSlot))).toEqual(['a', 'b', 'c']);

        heldSlot.owner.unholdSlot(heldSlot);
    });

    it('derives nothing at all while nobody reads it', () => {
        const { ordersService, orders, put, comparisons } = createFixture();
        const heldSlot = ordersService.computedCollectionService.holdSlotByKey(orders, 'deck');
        put({ id: 'c', rank: 30 }, { id: 'a', rank: 10 }, { id: 'b', rank: 20 });

        expect(comparisons()).toBe(0);

        heldSlot.owner.unholdSlot(heldSlot);
    });

    it('keeps the same list, by identity, for as long as the order holds', () => {
        const { ordersService, orders, put } = createFixture();
        const heldSlot = ordersService.computedCollectionService.holdSlotByKey(orders, 'deck');
        put({ id: 'a', rank: 10 }, { id: 'b', rank: 20 });

        const first = heldSlot.computedValueService.getValueForSlot(heldSlot);
        const again = heldSlot.computedValueService.getValueForSlot(heldSlot);

        expect(again).toBe(first);

        heldSlot.owner.unholdSlot(heldSlot);
    });

    it('reads the bucket and its sort column, and those sources do not grow with the bucket\'s slots', () => {
        const { byDeck, byDeckService, ordersService, orders, put } = createFixture();
        const heldSlot = ordersService.computedCollectionService.holdSlotByKey(orders, 'deck');
        const bucketSlot = byDeckService.getSlotByKey(byDeck, 'deck');
        const bucketRankColumnSlot = byDeckService.getBucketColumnByKey(byDeck, 'deck', 'rank');

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
        const heldSlot = ordersService.computedCollectionService.holdSlotByKey(orders, 'deck');

        let ran = 0;
        const effect = OIMEffectService.INSTANCE.createEffect(db, [], [heldSlot], () => { ran++; });
        put({ id: 'a', rank: 10 }, { id: 'b', rank: 20 }, { id: 'c', rank: 30 });
        db.flush();
        expect(ran).toBe(1);
        expect(idsOf(heldSlot.computedValueService.getValueForSlot(heldSlot))).toEqual(['a', 'b', 'c']);

        updateEntityByKey('b', { rank: 25 });
        db.flush();

        expect(ran).toBe(1);
        expect(idsOf(heldSlot.computedValueService.getValueForSlot(heldSlot))).toEqual(['a', 'b', 'c']);

        OIMEffectService.INSTANCE.disposeEffect(effect);
        heldSlot.owner.unholdSlot(heldSlot);
    });

    it('runs the body when the same write does change the list', () => {
        const { db, updateEntityByKey, ordersService, orders, put } = createFixture();
        const heldSlot = ordersService.computedCollectionService.holdSlotByKey(orders, 'deck');

        let ran = 0;
        const effect = OIMEffectService.INSTANCE.createEffect(db, [], [heldSlot], () => { ran++; });
        put({ id: 'a', rank: 10 }, { id: 'b', rank: 20 }, { id: 'c', rank: 30 });
        db.flush();
        expect(ran).toBe(1);

        updateEntityByKey('b', { rank: 99 });
        db.flush();

        expect(ran).toBe(2);
        expect(idsOf(heldSlot.computedValueService.getValueForSlot(heldSlot))).toEqual(['a', 'c', 'b']);

        OIMEffectService.INSTANCE.disposeEffect(effect);
        heldSlot.owner.unholdSlot(heldSlot);
    });

    it('runs the body when the key\'s entity slots changed, and not when they did not', () => {
        const { db, ordersService, orders, put } = createFixture();
        const heldSlot = ordersService.computedCollectionService.holdSlotByKey(orders, 'deck');

        let ran = 0;
        const effect = OIMEffectService.INSTANCE.createEffect(db, [], [heldSlot], () => { ran++; });
        put({ id: 'a', rank: 10 }, { id: 'b', rank: 20 });
        db.flush();
        expect(ran).toBe(1);

        put({ id: 'b', rank: 20 }, { id: 'a', rank: 10 });
        db.flush();
        expect(ran).toBe(1);

        put({ id: 'd', rank: 15 });
        db.flush();
        expect(ran).toBe(2);
        expect(idsOf(heldSlot.computedValueService.getValueForSlot(heldSlot))).toEqual(['a', 'd', 'b']);

        OIMEffectService.INSTANCE.disposeEffect(effect);
        heldSlot.owner.unholdSlot(heldSlot);
    });

    it('says nothing to a subscriber that arrived after the write, and still reads sorted', () => {
        const { db, ordersService, orders, put } = createFixture();
        const heldSlot = ordersService.computedCollectionService.holdSlotByKey(orders, 'deck');

        put({ id: 'c', rank: 30 }, { id: 'a', rank: 10 }, { id: 'b', rank: 20 });
        let ran = 0;
        const effect = OIMEffectService.INSTANCE.createEffect(db, [], [heldSlot], () => { ran++; });
        db.flush();

        expect(ran).toBe(0);
        expect(idsOf(heldSlot.computedValueService.getValueForSlot(heldSlot))).toEqual(['a', 'b', 'c']);

        OIMEffectService.INSTANCE.disposeEffect(effect);
        heldSlot.owner.unholdSlot(heldSlot);
    });
});

describe('what a derivation lets go of', () => {
    it('gives the bucket back when the last reader leaves', () => {
        const db = new OIMDB();
        const cardsService = createOIMEntityService<Card>(db, { keyOf: (card) => card.id });
        const cards = cardsService.createStoreSlot(db);
        const rankedService = createOIMBucketService<
            TCardSlotInBucket, string, TOIMBucketSlotsArrayStore<TCardSlotInBucket>, OIMSlotContentBucketServiceArrayDriven<TCardSlotInBucket>
        >(db, { slotContentService: new OIMSlotContentBucketServiceArrayDriven<TCardSlotInBucket>() });
        const ranked = rankedService.createStoreSlot(db);
        const orderService = createOIMComputedServiceBucketMemo({ bucketCollectionService: rankedService });
        const order = orderService.createBucketMemoStoreSlot(ranked);
        const heldSlot = orderService.computedCollectionService.holdSlotByKey(order, 'deck');
        const bucket = rankedService.getSlotByKey(ranked, 'deck');
        rankedService.slotContentService.writeBucketMemberSlots(
            bucket, [cardsService.slotContentService.upsertEntity(cards, { id: 'a', deck: 'deck', rank: 10 })],
        );
        expect(heldSlot.computedValueService.getValueForSlot(heldSlot).length).toBe(1);

        OIMUnusedSlotCollectorService.INSTANCE.flush(db.collectorSlot.unusedSlotCollectorSlot);
        expect(bucket.holdCount).toBeGreaterThan(0);
        expect(orderService.computedCollectionService.getSlotByKey(order, 'deck')).toBe(heldSlot);

        rankedService.slotContentService.clearBucketMemberSlots(bucket);
        heldSlot.owner.unholdSlot(heldSlot);

        expect(oimIsSlotReleased(heldSlot)).toBe(true);
        expect(oimIsSlotReleased(bucket)).toBe(true);
        expect(orderService.computedCollectionService.getSlotCount(order)).toBe(0);
        expect(rankedService.getSlotCount(ranked)).toBe(0);
    });
});

import { OIMEffectService } from '../../computed/OIMEffectService';
import { OIMSlotContentBucketServiceSetDriven } from '../../../facade/bucket/OIMSlotContentBucketServiceSetDriven';
import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMIndexService } from '../../../factories/createOIMIndexService';
import { createOIMBucketService } from '../../../factories/createOIMBucketService';
import { createOIMComputedServiceSorted } from '../../../factories/createOIMComputedServiceSorted';
import type { TOIMBucketSlot } from '../../bucket/types/TOIMBucketSlot';
import type { TOIMDBOptions } from '../../../factories/types/TOIMDBOptions';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';
import type { TOIMBucketSlotsArrayStore } from '../../bucket/array/types/TOIMBucketSlotsArrayStore';
import type { TOIMBucketSlotsSetStore } from '../../bucket/types/TOIMBucketSlotsSetStore';
import { oimIsSlotReleased } from '../../slot/utils/oimIsSlotReleased';

type TCard = { id: string; deckId: string; rank: number };

type TCardSlot = TOIMEntitySlot<TCard, TOIMStoreKey>;
type TDeck = TOIMBucketSlot<TOIMBucketSlotsArrayStore<TCardSlot>, TOIMStoreKey>;

const effectService = OIMEffectService.INSTANCE;

const byRankRefusingANegative = (left: TCard, right: TCard): number => {
    if (left.rank < 0 || right.rank < 0) throw new Error('sorter: rank is not comparable');
    return left.rank - right.rank;
};

const updateEntityByKey = (
    cardsService: ReturnType<typeof createOIMEntityService<TCard>>,
    cards: ReturnType<ReturnType<typeof createOIMEntityService<TCard>>['createStoreSlot']>,
    key: string, patch: Partial<TCard>,
): void => {
    const slot = cardsService.findSlotByKey(cards, key);
    if (slot !== undefined) cardsService.slotContentService.updateEntity(slot, patch);
};

function orderedByDeck(options?: TOIMDBOptions) {
    const db = new OIMDB(options);
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    const byDeckService = createOIMIndexService(db, {
        entityService: cardsService,
        keyOf: (card: TCard) => card.deckId,
    });
    const byDeck = byDeckService.createIndexStoreSlot(cards);
    const ordersService = createOIMComputedServiceSorted({
        indexService: byDeckService,
        sortColumns: [{ column: 'rank', direction: 'asc' }],
        comparator: byRankRefusingANegative,
    });
    const orders = ordersService.createSortedStoreSlot(byDeck);
    return { db, cardsService, cards, byDeckService, byDeck, ordersService, orders };
}

function filedByDeck(options?: TOIMDBOptions) {
    const db = new OIMDB(options);
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: (card: TCard) => card.id });
    const cards = cardsService.createStoreSlot(db);
    const byDeckService = createOIMBucketService<TCardSlot, TOIMStoreKey>(db);
    const byDeck = byDeckService.createStoreSlot(db);

    const heldDecks = new Map<string, TDeck>();
    const deck = (deckId: string): TDeck => {
        let bucket = heldDecks.get(deckId);
        if (bucket === undefined) {
            bucket = byDeckService.holdSlotByKey(byDeck, deckId);
            heldDecks.set(deckId, bucket);
        }
        return bucket;
    };
    const card = (id: string): TCardSlot => cardsService.getSlotByKey(cards, id)!;
    const file = (deckId: string, ids: readonly string[]): TDeck => {
        const bucket = deck(deckId);
        byDeckService.slotContentService.writeBucketMemberSlots(bucket, ids.map((id) => card(id)));
        return bucket;
    };
    return { db, cardsService, cards, byDeckService, byDeck, card, file };
}

function setDrivenDecks() {
    const db = new OIMDB();
    const byDeckService = createOIMBucketService<
        TCardSlot, TOIMStoreKey, TOIMBucketSlotsSetStore<TCardSlot>, OIMSlotContentBucketServiceSetDriven<TCardSlot>
    >(db, { slotContentService: new OIMSlotContentBucketServiceSetDriven<TCardSlot>() });
    return { db, byDeckService, byDeck: byDeckService.createStoreSlot(db) };
}

describe('a sorter that throws', () => {
    it('is raised at a read of the order, and a subscribe to the order says nothing', () => {
        const { db, cardsService, cards, ordersService, orders } = orderedByDeck();
        const order = ordersService.computedCollectionService.holdSlotByKey(orders, 'd1');
        cardsService.slotContentService.upsertEntities(cards, [
            { id: 'c1', deckId: 'd1', rank: 1 }, { id: 'c2', deckId: 'd1', rank: 2 },
        ]);
        expect(order.computedValueService.getValueForSlot(order).length).toBe(2);
        updateEntityByKey(cardsService, cards, 'c1', { rank: -1 });
        const effect = effectService.createEffect(db, [], [order], () => undefined);
        expect(() => order.computedValueService.getValueForSlot(order)).toThrow('sorter: rank is not comparable');
        effectService.disposeEffect(effect);
        order.owner.unholdSlot(order);
    });

    it('costs one key its wake-up and not the keys after it', () => {
        const errors: unknown[] = [];
        const { db, cardsService, cards, byDeckService, byDeck, ordersService, orders } = orderedByDeck({ errorPolicy: { onErrorCaught: (e) => { errors.push(e); } } });
        const d1Order = ordersService.computedCollectionService.holdSlotByKey(orders, 'd1');
        const d2Order = ordersService.computedCollectionService.holdSlotByKey(orders, 'd2');
        const d1 = byDeckService.holdSlotByKey(byDeck, 'd1');
        cardsService.slotContentService.upsertEntities(cards, [
            { id: 'b1', deckId: 'd1', rank: 1 }, { id: 'b2', deckId: 'd1', rank: 2 },
            { id: 'a1', deckId: 'd2', rank: 1 }, { id: 'a2', deckId: 'd2', rank: 2 },
        ]);
        expect(d1Order.computedValueService.getValueForSlot(d1Order).length).toBe(2);
        expect(d2Order.computedValueService.getValueForSlot(d2Order).length).toBe(2);
        db.flush();

        let wokeGood = 0;
        effectService.createEffect(db, [d1], [], () => undefined);
        effectService.createEffect(db, [], [d2Order], () => { wokeGood++; });

        updateEntityByKey(cardsService, cards, 'b1', { rank: -1 });
        updateEntityByKey(cardsService, cards, 'a1', { rank: 3 });

        expect(() => d1Order.computedValueService.getValueForSlot(d1Order)).toThrow(/sorter/);
        db.flush();

        expect(wokeGood).toBe(1);
        expect(d2Order.computedValueService.getValueForSlot(d2Order).map(slot => slot.entity?.id)).toEqual(['a2', 'a1']);
        expect(errors).toHaveLength(0);
    });

    it('leaves the key holding every entity slot, when the newcomer is the one it cannot rank', () => {
        const { cardsService, cards, byDeckService, byDeck, ordersService, orders } = orderedByDeck();
        const order = ordersService.computedCollectionService.holdSlotByKey(orders, 'd1');
        const deck = byDeckService.holdSlotByKey(byDeck, 'd1');
        for (const id of ['c1', 'c2', 'c3', 'c4']) {
            cardsService.slotContentService.upsertEntity(cards, { id, deckId: 'd1', rank: Number(id.slice(1)) });
        }
        expect(order.computedValueService.getValueForSlot(order).length).toBe(4);

        cardsService.slotContentService.upsertEntity(cards, { id: 'c5', deckId: 'd1', rank: -1 });

        expect(() => order.computedValueService.getValueForSlot(order)).toThrow('sorter: rank is not comparable');
        expect(byDeckService.slotContentService.getBucketMemberSlotCount(deck)).toBe(5);
        expect(() => order.computedValueService.getValueForSlot(order)).toThrow('sorter: rank is not comparable');
        expect(byDeckService.slotContentService.getBucketMemberSlotCount(deck)).toBe(5);
    });

    it('leaves the key holding every entity slot, when a mover is the one it cannot rank', () => {
        const { cardsService, cards, byDeckService, byDeck, ordersService, orders } = orderedByDeck();
        const order = ordersService.computedCollectionService.holdSlotByKey(orders, 'd1');
        const deck = byDeckService.holdSlotByKey(byDeck, 'd1');
        for (const id of ['c1', 'c2', 'c3', 'c4']) {
            cardsService.slotContentService.upsertEntity(cards, { id, deckId: 'd1', rank: Number(id.slice(1)) });
        }
        expect(order.computedValueService.getValueForSlot(order).length).toBe(4);

        updateEntityByKey(cardsService, cards, 'c2', { rank: -1 });

        expect(() => order.computedValueService.getValueForSlot(order)).toThrow('sorter: rank is not comparable');
        expect(byDeckService.slotContentService.getBucketMemberSlotCount(deck)).toBe(4);
        expect(() => order.computedValueService.getValueForSlot(order)).toThrow('sorter: rank is not comparable');
        expect(byDeckService.slotContentService.getBucketMemberSlotCount(deck)).toBe(4);
    });
});

// `OIMEffectService.createEffect` wires its edges in one `try`, and what fails inside it is a source
// the engine let go of. Nothing is settled at subscribe.
describe('a batch subscribe a released bucket refuses', () => {
    // Two decks — the first of which has an edge to lose, the second released
    // before the batch names it.
    const twoDecks = () => {
        const bench = filedByDeck();
        bench.cardsService.slotContentService.upsertEntities(bench.cards, [
            { id: 'c1', deckId: 'd1', rank: 1 }, { id: 'c2', deckId: 'd1', rank: 2 },
        ]);
        bench.db.flush();
        const good = bench.file('d1', ['c1', 'c2']);
        expect(Array.from(bench.byDeckService.slotContentService.getBucketMemberSlots(good)).length).toBe(2);
        const gone = bench.byDeckService.holdSlotByKey(bench.byDeck, 'd2');
        gone.owner.unholdSlot(gone);
        expect(oimIsSlotReleased(gone)).toBe(true);
        return { bench, good, gone };
    };

    it('leaves nothing subscribed to the buckets it had already taken', () => {
        const { bench, good, gone } = twoDecks();

        // The good bucket is first, so its edge is attached before the call
        // refuses.
        expect(() => effectService.createEffect(bench.db, [good, gone], [], () => undefined))
            .toThrow(/This identity was released/);

        expect(good.effects?.length).toBe(0);
    });

    // The same fact from the side a caller can SEE: a leaked subscription is a
    // body that goes on being called for a call the caller was told had failed.
    it('calls no body of a batch that refused', () => {
        const { bench, good, gone } = twoDecks();

        let runCount = 0;
        expect(() => effectService.createEffect(bench.db, [good, gone], [], () => { runCount++; }))
            .toThrow(/This identity was released/);

        // A change to the GOOD list alone, and one that really changes it, so
        // this frame is an ordinary one in every way except who is listening.
        bench.byDeckService.slotContentService.writeBucketMemberSlots(good, [bench.card('c1')]);
        bench.db.flush();

        expect(runCount).toBe(0);
    });
});

describe('a slot the engine has let go of', () => {
    it('refuses a subscriber and refuses a hold, by name', () => {
        const { db, byDeckService, byDeck } = setDrivenDecks();
        const deckSlot = byDeckService.holdSlotByKey(byDeck, 'd1');
        expect(byDeckService.getSlotByKey(byDeck, 'd1')).toBe(deckSlot);

        deckSlot.owner.unholdSlot(deckSlot);

        expect(oimIsSlotReleased(deckSlot)).toBe(true);
        expect(byDeckService.getSlotCount(byDeck)).toBe(0);
        expect(() => effectService.createEffect(db, [deckSlot], [], () => undefined))
            .toThrow(/This identity was released/);
        expect(() => deckSlot.owner.holdSlot(deckSlot)).toThrow(/This identity was released/);
    });

    it('is a fresh identity when the key is resolved again', () => {
        const { db, byDeckService, byDeck } = setDrivenDecks();
        const first = byDeckService.holdSlotByKey(byDeck, 'd1');
        first.owner.unholdSlot(first);

        const second = byDeckService.holdSlotByKey(byDeck, 'd1');
        expect(second).not.toBe(first);
        expect(() => effectService.createEffect(db, [second], [], () => undefined)).not.toThrow();
        second.owner.unholdSlot(second);
    });
});

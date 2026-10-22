/**
 * THE SCRATCH THIS ENGINE KEEPS BETWEEN CALLS, AND THE MOMENTS IT CHANGES
 * HANDS.
 *
 * Several hot paths here allocate nothing on an ordinary call because they hold
 * their working memory at module scope and reuse it: the seven buffers
 * `oimOrderedListCommandsOfTransition` carries between diffs. Each of them has a branch that takes the buffer AWAY —
 * dropped above a size ceiling — and none of those branches is reached by any other test in
 * this suite, because every one of them needs a very large batch.
 *
 * They are worth reaching for a reason that has nothing to do with the branch
 * count. Shared mutable state whose ownership changes on a condition is the one
 * shape where a defect cannot be local: the call that misbehaves is not the call
 * that met the condition, it is THE NEXT ONE, and what it produces is a
 * plausible wrong answer rather than a throw. So every test below is a pair —
 * the call that hits the ceiling or nests, and then an ordinary call after it,
 * asserted in full.
 *
 * ─── THE ONE THAT LEFT, AND WHY IT CANNOT COME BACK ───────────────────────
 *
 * A case stood between the manifest lists and the diff: "one subscriber store,
 * two databases". One `subscribers` store served both databases, and the
 * delivery buffer was that store's — so a subscriber of the first database that
 * wrote to the second and flushed it ran a whole second delivery over the same
 * array, and every subscriber queued behind the re-entrant one was silently
 * dropped from a frame it was queued in.
 *
 * Neither the store nor the option exists. A subscription is a `TOIMEffect` in
 * the slot's own `effects` array, and the frame's list of leaves is the channel
 * slot's `effectChannelQueue`. What that case measured is not measured elsewhere and
 * does not need to be: the sharing it depended on is a type error.
 */
import { OIMEffectService } from '../src/engine/computed/OIMEffectService';
import { OIMSlotContentBucketServiceSetDriven } from '../src/facade/bucket/OIMSlotContentBucketServiceSetDriven';
import { OIMDB } from '../src/factories/OIMDB';
import { createOIMEntityService } from '../src/factories/createOIMEntityService';
import { createOIMBucketService } from '../src/factories/createOIMBucketService';
import { createOIMIndexService } from '../src/factories/createOIMIndexService';
import { createOIMComputedServiceSorted } from '../src/factories/createOIMComputedServiceSorted';
import type { TOIMComputedSlot } from '../src/engine/computed/types/TOIMComputedSlot';
import { oimOrderedListCommandsOfTransition } from '../src/engine/bucket/commands/utils/oimOrderedListCommandsOfTransition';
import type { TOIMBucketSlot } from '../src/engine/bucket/types/TOIMBucketSlot';
import type { TOIMEntitySlot } from '../src/engine/entity/types/TOIMEntitySlot';
import type { TOIMEntityColumnName } from '../src/engine/entity/types/TOIMEntityColumnName';
import type { TOIMStoreKey } from '../src/engine/store/types/TOIMStoreKey';
import type { TOIMBucketSlotsSetStore } from '../src/engine/bucket/types/TOIMBucketSlotsSetStore';
import { oimIsSlotReleased } from '../src/engine/slot/utils/oimIsSlotReleased';
import { applyOrderedListCommands, sameEntitySlotSequence } from './support/orderedListConsumer';

type TRow = { id: string; n: number };

/** A minimal identity: the diff reads nothing but reference equality. */
const makeSlot = (id: number): TOIMEntitySlot => ({ key: id } as unknown as TOIMEntitySlot);

const collectionOf = <TEntity extends object>(db: OIMDB, keyOf: (entity: TEntity) => TOIMStoreKey) => {
    const collectionService = createOIMEntityService<TEntity, TOIMEntityColumnName<TEntity>, TOIMStoreKey>(db, { keyOf });
    const collection = collectionService.createStoreSlot(db);
    const updateEntityByKey = (key: TOIMStoreKey, patch: Partial<TEntity>): void => {
        const entitySlot = collectionService.findSlotByKey(collection, key);
        if (entitySlot !== undefined) collectionService.slotContentService.updateEntity(entitySlot, patch);
    };
    return { collectionService, collection, updateEntityByKey };
};

/**
 * WHAT THIS BLOCK WAS WRITTEN TO REACH IS GONE, and the case is kept anyway.
 *
 * TWO manifest lists were traded each frame — one being filled, one being
 * delivered — and above `PENDING_KEEP_AT_MOST` the list just reported was
 * DROPPED rather than emptied, which is why the case had to look two frames
 * ahead: the replacement was only reached on the frame after next.
 *
 * There is one list — `channelSlot.effectChannelQueue`, walked once and then
 * emptied — with no ceiling, no drop and no swap. So there is no
 * branch here to reach, and what the case still asserts is the ordinary
 * property that branch existed to protect: a frame far larger than any other
 * leaves the frames after it delivering exactly what they owe, and leaves
 * nothing queued behind.
 */
describe('a frame far larger than the ones around it', () => {
    it('keeps delivering, on the frame after and the frame after that', () => {
        // Larger than every frame after it by two orders of magnitude, and no
        // larger: there is no size threshold for a frame to cross.
        const many = 256;
        const db = new OIMDB();
        const effectService = OIMEffectService.INSTANCE;
        const { collectionService: rowsService, collection: rows, updateEntityByKey } = collectionOf<TRow>(db, (row) => row.id);
        for (let i = 0; i < many; i++) rowsService.slotContentService.upsertEntity(rows, { id: `r${i}`, n: 0 });
        db.flush();

        let runCount = 0;
        for (let i = 0; i < many; i++) {
            effectService.createEffect(db, [rowsService.getSlotByKey(rows, `r${i}`)], [], () => { runCount++; });
        }
        for (let i = 0; i < many; i++) updateEntityByKey(`r${i}`, { n: 1 });
        db.flush();
        expect(runCount).toBe(many);

        // The frame that follows the giant one.
        runCount = 0;
        updateEntityByKey('r7', { n: 2 });
        db.flush();
        expect(runCount).toBe(1);

        // And the frame after that, which is where a swapped-out list used to
        // be reached for the first time.
        runCount = 0;
        updateEntityByKey('r8', { n: 3 });
        db.flush();
        expect(runCount).toBe(1);

        // Nothing was left queued from the giant frame either: a list emptied
        // while it still held leaves would deliver them here.
        runCount = 0;
        db.flush();
        expect(runCount).toBe(0);
    });
});

describe('the ordered-list diff, after a list far past its ceiling', () => {
    /**
     * Seven buffers are carried between diffs and every one of them is
     * conditionally replaced — the map above `KEEP_AT_MOST`, and each
     * `Int32Array` when it is past that bound and more than twice what the call
     * needs. Every one of those conditions is met by ONE giant diff, and what
     * they cost, if they cost anything, is charged to the next caller: two
     * ordered consumers in one process are two callers of these same buffers.
     */
    it('produces a correct script for a small list immediately after a huge one', () => {
        const huge = Array.from({ length: 6000 }, (_, i) => makeSlot(i));
        // Reversed, so the diff does real work rather than finding one anchor
        // and stopping — this is the shape a column header click produces.
        const hugeReversed = huge.slice().reverse();
        oimOrderedListCommandsOfTransition(huge, hugeReversed);

        // The ordinary call after it, with everything the diff can emit in it:
        // a removal, an arrival, and a reorder of what survived.
        const [a, b, c, d] = [makeSlot(1), makeSlot(2), makeSlot(3), makeSlot(4)];
        const prev = [a, b, c];
        const next = [c, a, d];
        const commands = oimOrderedListCommandsOfTransition(prev, next);

        expect(sameEntitySlotSequence(applyOrderedListCommands(prev.slice(), commands), next)).toBe(true);
    });

    /**
     * The same claim from the other side: a giant diff run BETWEEN two small
     * ones must not change what the second small one produces. Anything the
     * buffers carried across would show up here as a script that no longer
     * matches the one the identical inputs produced a moment ago.
     */
    it('answers the identical question identically either side of a huge one', () => {
        const [a, b, c, d] = [makeSlot(1), makeSlot(2), makeSlot(3), makeSlot(4)];
        const before = oimOrderedListCommandsOfTransition([a, b, c], [c, a, d]);

        const huge = Array.from({ length: 6000 }, (_, i) => makeSlot(1000 + i));
        oimOrderedListCommandsOfTransition(huge, huge.slice().reverse());

        const after = oimOrderedListCommandsOfTransition([a, b, c], [c, a, d]);
        expect(after).toEqual(before);
    });
});

describe('an index order whose comparator reads another order', () => {
    type TCard = { id: string; deckId: string; rank: number };
    type TDeck = { id: string; ord: number };

    const idsOf = (slots: readonly TOIMEntitySlot<{ id: string }>[]): string[] =>
        slots.map(slot => slot.entity?.id ?? '?');

    const createFixture = () => {
        const db = new OIMDB();
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        const cardIndexService = createOIMIndexService(db, {
            entityService: cardsService,
            keyOf: (card: TCard) => card.deckId,
        });
        const cardIndex = cardIndexService.createIndexStoreSlot(cards);
        const cardIndexOrdersService = createOIMComputedServiceSorted({
            indexService: cardIndexService,
            sortColumns: [{ column: 'rank', direction: 'asc' }],
        });
        const cardIndexOrders = cardIndexOrdersService.createSortedStoreSlot(cardIndex);
        const cardOrders = new Map<string, TOIMComputedSlot<readonly TOIMEntitySlot<TCard>[], string>>();
        for (const id of ['d1', 'd2', 'd3']) {
            cardOrders.set(id, cardIndexOrdersService.computedCollectionService.holdSlotByKey(cardIndexOrders, id));
        }
        const sizeOf = (id: string): number => {
            const cardOrder = cardOrders.get(id);
            return cardOrder === undefined ? 0 : cardOrder.computedValueService.getValueForSlot(cardOrder).length;
        };

        const decksService = createOIMEntityService<TDeck>(db, { keyOf: deck => deck.id });
        const decks = decksService.createStoreSlot(db);
        const deckIndexService = createOIMIndexService(db, {
            entityService: decksService,
            keyOf: () => 'all',
        });
        const deckIndex = deckIndexService.createIndexStoreSlot(decks);
        const deckIndexOrdersService = createOIMComputedServiceSorted({
            indexService: deckIndexService,
            comparator: (left: TDeck, right: TDeck) => {
                const byChildren = sizeOf(right.id) - sizeOf(left.id);
                if (byChildren !== 0) return byChildren;
                return left.ord - right.ord;
            },
        });
        const deckIndexOrders = deckIndexOrdersService.createSortedStoreSlot(deckIndex);
        const deckOrder = deckIndexOrdersService.computedCollectionService.holdSlotByKey(deckIndexOrders, 'all');

        decksService.slotContentService.upsertEntities(decks, ['d1', 'd2', 'd3'].map((id, at) => ({ id, ord: at + 1 })));
        cardsService.slotContentService.upsertEntities(cards, [
            { id: 'c1', deckId: 'd1', rank: 2 },
            { id: 'c2', deckId: 'd2', rank: 1 },
            { id: 'c3', deckId: 'd2', rank: 3 },
            { id: 'c4', deckId: 'd2', rank: 2 },
            { id: 'c5', deckId: 'd3', rank: 1 },
        ]);
        expect(idsOf(deckOrder.computedValueService.getValueForSlot(deckOrder))).toEqual(['d2', 'd1', 'd3']);
        db.flush();

        const updateCard = (key: string, patch: Partial<TCard>): void => {
            const cardSlot = cardsService.findSlotByKey(cards, key);
            if (cardSlot !== undefined) cardsService.slotContentService.updateEntity(cardSlot, patch);
        };
        const updateDeck = (key: string, patch: Partial<TDeck>): void => {
            const deckSlot = decksService.findSlotByKey(decks, key);
            if (deckSlot !== undefined) decksService.slotContentService.updateEntity(deckSlot, patch);
        };

        return {
            db, cards, cardsService, decks, decksService, cardIndex, deckIndex, cardIndexOrders, deckIndexOrders, cardOrders, deckOrder,
            updateCard, updateDeck,
        };
    };

    it('orders both keys correctly when the inner order has movers of its own', () => {
        const { updateCard, updateDeck, cardOrders, deckOrder } = createFixture();

        updateCard('c3', { rank: 0 });
        updateDeck('d3', { ord: 0 });

        expect(idsOf(deckOrder.computedValueService.getValueForSlot(deckOrder))).toEqual(['d2', 'd3', 'd1']);
        const d2Order = cardOrders.get('d2')!;
        expect(idsOf(d2Order.computedValueService.getValueForSlot(d2Order))).toEqual(['c3', 'c2', 'c4']);
    });

    it('leaves an ordinary sort afterwards working on the whole order', () => {
        const { db, cards, cardsService, updateCard, updateDeck, cardOrders, deckOrder } = createFixture();
        const d2Order = cardOrders.get('d2')!;
        updateCard('c3', { rank: 0 });
        updateDeck('d3', { ord: 0 });
        expect(deckOrder.computedValueService.getValueForSlot(deckOrder).length).toBe(3);
        db.flush();

        updateCard('c2', { rank: 9 });
        expect(idsOf(d2Order.computedValueService.getValueForSlot(d2Order))).toEqual(['c3', 'c4', 'c2']);

        cardsService.slotContentService.upsertEntity(cards, { id: 'c6', deckId: 'd2', rank: 1 });
        expect(idsOf(d2Order.computedValueService.getValueForSlot(d2Order))).toEqual(['c3', 'c6', 'c4', 'c2']);
    });

    it('loses no entity slot of either order across the re-entry', () => {
        const { updateCard, updateDeck, cardOrders, deckOrder } = createFixture();
        updateCard('c3', { rank: 0 });
        updateDeck('d3', { ord: 0 });

        expect(deckOrder.computedValueService.getValueForSlot(deckOrder).length).toBe(3);
        const d1Order = cardOrders.get('d1')!;
        const d2Order = cardOrders.get('d2')!;
        const d3Order = cardOrders.get('d3')!;
        expect(d1Order.computedValueService.getValueForSlot(d1Order).length).toBe(1);
        expect(d2Order.computedValueService.getValueForSlot(d2Order).length).toBe(3);
        expect(d3Order.computedValueService.getValueForSlot(d3Order).length).toBe(1);
    });
});

describe('an unordered collection, as the control for all of the above', () => {
    /**
     * None of the buffers under test here belong to the unordered path, so this
     * is the reading that should not move whatever the tests above do. It is
     * here so that a failure in this file points at the scratch and not at the
     * fixtures.
     */
    it('holds and reads a bucket with no ordering at all', () => {
        type TCard = { id: string; deckId: string };
        type TCardSlot = TOIMEntitySlot<TCard>;
        const db = new OIMDB();
        const { collectionService: cardsService, collection: cards } = collectionOf<TCard>(db, (card) => card.id);
        const indexService = createOIMBucketService<
            TCardSlot, TOIMStoreKey, TOIMBucketSlotsSetStore<TCardSlot>, OIMSlotContentBucketServiceSetDriven<TCardSlot>
        >(db, { slotContentService: new OIMSlotContentBucketServiceSetDriven<TCardSlot>() });
        const index = indexService.createStoreSlot(db);
        const heldSlot = indexService.holdSlotByKey(index, 'spades');
        cardsService.slotContentService.upsertEntities(cards, [{ id: 'c1', deckId: 'spades' }, { id: 'c2', deckId: 'spades' }]);
        indexService.slotContentService.writeBucketMemberSlots(heldSlot, ['c1', 'c2'].map(id => cardsService.getSlotByKey(cards, id)));
        heldSlot.owner.unholdSlot(heldSlot);
        db.flush();
        expect(indexService.slotContentService.getBucketMemberSlotCount(heldSlot)).toBe(2);
    });
});

describe('what the index maintenance leaves in its bucket', () => {
    type TCard = { id: string; deck: string };
    type TSlots = TOIMBucketSlotsSetStore<TOIMEntitySlot<TCard>>;
    type TBucket = TOIMBucketSlot<TSlots, TOIMStoreKey>;

    const indexedWorld = () => {
        const db = new OIMDB();
        const { collectionService: cardsService, collection: cards, updateEntityByKey } = collectionOf<TCard>(db, card => card.id);
        const byDeckService = createOIMIndexService(db, {
            entityService: cardsService,
            keyOf: (card: TCard) => card.deck,
            slotContentService: new OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TCard>>(),
        });
        const byDeck = byDeckService.createIndexStoreSlot(cards);
        const idsIn = (bucketSlot: TBucket): string[] =>
            Array.from(byDeckService.slotContentService.getBucketMemberSlots(bucketSlot))
                .map(slot => slot.entity?.id ?? '')
                .sort();
        return { db, cards, cardsService, updateEntityByKey, byDeck, byDeckService, idsIn };
    };

    it('files the row in its bucket on a join', () => {
        const { db, cardsService, cards, byDeckService, byDeck, idsIn } = indexedWorld();
        const spades = byDeckService.holdSlotByKey(byDeck, 'spades');

        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deck: 'spades' });
        db.flush();

        expect(idsIn(spades)).toEqual(['c1']);
    });

    it('moves the row between two buckets', () => {
        const { db, cardsService, cards, updateEntityByKey, byDeckService, byDeck, idsIn } = indexedWorld();
        const spades = byDeckService.holdSlotByKey(byDeck, 'spades');
        const clubs = byDeckService.holdSlotByKey(byDeck, 'clubs');
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deck: 'spades' });
        db.flush();

        updateEntityByKey('c1', { deck: 'clubs' });
        db.flush();

        expect(idsIn(spades)).toEqual([]);
        expect(idsIn(clubs)).toEqual(['c1']);
    });

    it('releases the row it removed', () => {
        const { db, cardsService, cards, byDeckService, byDeck } = indexedWorld();
        byDeckService.holdSlotByKey(byDeck, 'spades');
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deck: 'spades' });
        db.flush();
        const slot = cardsService.getSlotByKey(cards, 'c1');

        cardsService.slotContentService.deleteEntity(slot);
        db.flush();

        expect(oimIsSlotReleased(slot)).toBe(true);
    });

    it('leaves the next ordinary join reading exactly its own row', () => {
        const { db, cardsService, cards, byDeckService, byDeck, idsIn } = indexedWorld();
        const spades = byDeckService.holdSlotByKey(byDeck, 'spades');
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deck: 'spades' });
        db.flush();
        cardsService.slotContentService.deleteEntity(cardsService.getSlotByKey(cards, 'c1'));
        db.flush();

        cardsService.slotContentService.upsertEntity(cards, { id: 'c2', deck: 'spades' });
        db.flush();

        expect(idsIn(spades)).toEqual(['c2']);
    });
});

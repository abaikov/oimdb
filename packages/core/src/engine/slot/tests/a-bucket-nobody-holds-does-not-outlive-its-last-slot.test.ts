import { OIMDefaults } from '../../../factories/OIMDefaults';
import { createOIMBucketService } from '../../../factories/createOIMBucketService';
import {
    OIMDB,
    OIMEffectService,
    OIMSlotContentBucketServiceArrayDriven,
    OIMSlotContentBucketServiceSetDriven,
    OIMSlotStoreServiceTreeDriven,
    createOIMEntityService,
    oimIsSlotEmpty,
    oimIsSlotReleased,
} from '../../../index';
import type {
    TOIMBucketSlot, TOIMEntitySlot, TOIMBucketSlotsArrayStore, TOIMBucketSlotsSetStore, TOIMSlot,
} from '../../../index';
import type { TOIMSlotStoreTree } from '../../store/types/TOIMSlotStoreTree';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';

type TCard = { id: string; deckId: string };
type TTag = { id: string };
type TCardSlot = TOIMEntitySlot<TCard, TOIMStoreKey>;
type TChain = readonly TOIMEntitySlot[];
type TChainBucketStore = TOIMSlotStoreTree<TOIMBucketSlot<TOIMBucketSlotsSetStore<TCardSlot>, TChain>, TOIMEntitySlot>;

function createFixture() {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
    // See {@link bucketHolds}: anything still recorded is a hold on a collection
    // the previous case has already dropped.
    bucketHolds.length = 0;
    const cards = cardsService.createStoreSlot(db);
    return { db, cardsService, cards };
}

const bucketHolds: (() => void)[] = [];

const mintAt = <TStoreSlot, TBucketSlot extends TOIMSlot>(
    bucketService: { holdSlotByKey(storeSlot: TStoreSlot, key: string): TBucketSlot },
    buckets: TStoreSlot,
    key: string,
): TBucketSlot => {
    const heldSlot = bucketService.holdSlotByKey(buckets, key);
    bucketHolds.push(() => { heldSlot.owner.unholdSlot(heldSlot); });
    return heldSlot;
};

const unhold = (): void => {
    for (const release of bucketHolds) release();
    bucketHolds.length = 0;
};

function byDeckIndex(db: OIMDB, slotContentService = new OIMSlotContentBucketServiceSetDriven<TCardSlot>()) {
    const byDeckService = createOIMBucketService<
        TCardSlot, string, TOIMBucketSlotsSetStore<TCardSlot>, OIMSlotContentBucketServiceSetDriven<TCardSlot>
    >(db, { slotContentService });
    return { byDeckService, byDeck: byDeckService.createStoreSlot(db) };
}

/** A positional list: the caller places the slots, so the service sorts nothing. */
function listOver(db: OIMDB) {
    const listService = createOIMBucketService<
        TCardSlot, string, TOIMBucketSlotsArrayStore<TCardSlot>, OIMSlotContentBucketServiceArrayDriven<TCardSlot>
    >(db, { slotContentService: new OIMSlotContentBucketServiceArrayDriven<TCardSlot>() });
    return { listService, list: listService.createStoreSlot(db) };
}

describe('a bucket nobody holds does not outlive its last slot', () => {
    it('a keyed bucket is let go once its last slot leaves and nobody watches', () => {
        const { db, cardsService, cards } = createFixture();
        const { byDeckService, byDeck } = byDeckIndex(db);
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deckId: 'd1' });
        db.flush();
        const d1 = mintAt(byDeckService, byDeck, 'd1');
        byDeckService.slotContentService.writeBucketMemberSlots(d1, [cardsService.getSlotByKey(cards, 'c1')!]);
        // The slot in it is now the whole of what keeps it.
        unhold();
        expect(byDeckService.getSlotByKey(byDeck, 'd1')).toBe(d1);

        byDeckService.slotContentService.clearBucketMemberSlots(d1);
        expect(oimIsSlotReleased(d1)).toBe(true);
        expect(byDeckService.getSlotCount(byDeck)).toBe(0);
    });

    it('removing the entity leaves the slot, and the bucket, where the caller put them', () => {
        const { db, cardsService, cards } = createFixture();
        const { byDeckService, byDeck } = byDeckIndex(db);
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deckId: 'd1' });
        db.flush();
        const d1 = mintAt(byDeckService, byDeck, 'd1');
        const card = cardsService.getSlotByKey(cards, 'c1')!;
        byDeckService.slotContentService.writeBucketMemberSlots(d1, [card]);
        // So that the bucket surviving the removal below is THE SLOT IN IT
        // doing it and not this fixture's.
        unhold();

        cardsService.slotContentService.deleteEntity(card);
        db.flush();

        expect(oimIsSlotEmpty(card)).toBe(true);
        expect(byDeckService.getSlotByKey(byDeck, 'd1')).toBe(d1);
        expect(byDeckService.slotContentService.getBucketMemberSlotCount(d1)).toBe(1);
        // The slot in it is the whole of what keeps it — one reference, counted
        // on that slot.
        expect(card.holdCount).toBe(1);
    });

    it('a manual bucket emptied by write is let go', () => {
        const { db, cardsService, cards } = createFixture();
        const { byDeckService: searchService, byDeck: search } = byDeckIndex(db);
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deckId: 'd1' });
        db.flush();

        const bucket = mintAt(searchService, search, 'query');
        searchService.slotContentService.writeBucketMemberSlots(bucket, [cardsService.getSlotByKey(cards, 'c1')!]);
        unhold();
        db.flush();
        expect(searchService.getSlotByKey(search, 'query')).toBe(bucket);

        searchService.slotContentService.writeBucketMemberSlots(bucket, []);
        expect(oimIsSlotReleased(bucket)).toBe(true);
        expect(searchService.getSlotCount(search)).toBe(0);
    });

    it('a bucket the caller is holding survives being emptied, and is refilled through the hold', () => {
        const { db, cardsService, cards } = createFixture();
        const { listService, list } = listOver(db);
        cardsService.slotContentService.upsertEntities(cards, [{ id: 'c1', deckId: 'd1' }, { id: 'c2', deckId: 'd1' }]);
        db.flush();

        // The reference a caller keeps — nothing is subscribed to it yet, which
        // is the ordinary state of a list being hydrated before anything renders.
        const heldSlot = listService.holdSlotByKey(list, 'ann-today');
        const bucket = heldSlot;
        listService.slotContentService.writeBucketMemberSlots(bucket, [cardsService.getSlotByKey(cards, 'c1')!]);
        db.flush();

        listService.slotContentService.clearBucketMemberSlots(bucket);
        expect(listService.getSlotByKey(list, 'ann-today')).toBe(bucket);
        listService.slotContentService.insertBucketMemberSlotAt(
            bucket, listService.slotContentService.getBucketMemberSlotCount(bucket), cardsService.getSlotByKey(cards, 'c2')!,
        );
        db.flush();

        expect(listService.getSlotByKey(list, 'ann-today')).toBe(bucket);
        expect(listService.getSlotCount(list)).toBe(1);
        const listed = Array.from(listService.slotContentService.getBucketMemberSlots(bucket));
        expect(listed.map(slot => slot.key)).toEqual(['c2']);
        expect(listed[0] === cardsService.getSlotByKey(cards, 'c2')).toBe(true);

        // And giving the hold back and asking is what ends it: the bucket is
        // nobody's only once nobody is holding it.
        listService.slotContentService.clearBucketMemberSlots(bucket);
        expect(listService.getSlotByKey(list, 'ann-today')).toBe(bucket);
        heldSlot.owner.unholdSlot(heldSlot);
        expect(oimIsSlotReleased(bucket)).toBe(true);
        expect(listService.getSlotCount(list)).toBe(0);
    });

    it('a bucket nobody holds is let go by the write that empties it, and not a frame later', () => {
        const { db, cardsService, cards } = createFixture();
        const { listService, list } = listOver(db);
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deckId: 'd1' });
        db.flush();

        const bucket = mintAt(listService, list, 'ann-today');
        listService.slotContentService.writeBucketMemberSlots(bucket, [cardsService.getSlotByKey(cards, 'c1')!]);
        // "A BUCKET NOBODY HOLDS" is the title, so the resolver's hold goes here.
        unhold();
        db.flush();

        // No hold, no effect, no slot: the call that took the last one out is
        // where the answer is given.
        listService.slotContentService.clearBucketMemberSlots(bucket);
        expect(oimIsSlotReleased(bucket)).toBe(true);
        expect(listService.getSlotCount(list)).toBe(0);
    });

    it('letting go of a stale bucket does not take the live one under its key with it', () => {
        const { db, cardsService, cards } = createFixture();
        const { byDeckService, byDeck } = byDeckIndex(db);
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deckId: 'd1' });
        db.flush();

        const stale = mintAt(byDeckService, byDeck, 'q');
        // The resolver's hold IS the last reference, so handing it back is what
        // unfiles this one.
        unhold();
        const live = mintAt(byDeckService, byDeck, 'q');
        expect(live).not.toBe(stale);

        byDeckService.slotContentService.writeBucketMemberSlots(live, [cardsService.getSlotByKey(cards, 'c1')!]);
        OIMEffectService.INSTANCE.createEffect(db, [live], [], () => { /* held by an effect */ });
        unhold();
        db.flush();

        // The dead one refuses, and by key alone this deleted the live bucket
        // instead: full, subscribed to, and gone without a word.
        expect(() => byDeckService.slotContentService.clearBucketMemberSlots(stale)).toThrow(/This identity was released/);
        expect(byDeckService.getSlotByKey(byDeck, 'q')).toBe(live);
        expect(byDeckService.slotContentService.getBucketMemberSlotCount(live)).toBe(1);
    });

    it('two collections over one bucket service do not disturb each other', () => {
        const { db, cardsService, cards } = createFixture();
        // ONE service, TWO collections — the construction the latch refused.
        const service = new OIMSlotContentBucketServiceSetDriven<TCardSlot>();
        const { byDeckService: leftService, byDeck: left } = byDeckIndex(db, service);
        const { byDeckService: rightService, byDeck: right } = byDeckIndex(db, service);
        cardsService.slotContentService.upsertEntities(cards, [{ id: 'c1', deckId: 'd1' }, { id: 'c2', deckId: 'd1' }]);
        db.flush();

        const inLeft = mintAt(leftService, left, 'k');
        const inRight = mintAt(rightService, right, 'k');
        leftService.slotContentService.writeBucketMemberSlots(inLeft, [cardsService.getSlotByKey(cards, 'c1')!]);
        rightService.slotContentService.writeBucketMemberSlots(inRight, [cardsService.getSlotByKey(cards, 'c2')!]);
        // Each is kept by its own slot from here, so the emptying at the end is
        // a fact about one collection and not about who is holding what.
        unhold();

        // The storage a service builds belongs to the BUCKET it built it for, so
        // the two buckets hold their slots apart even at the same key.
        expect(leftService.slotContentService.getBucketMemberSlotCount(inLeft)).toBe(1);
        expect(rightService.slotContentService.getBucketMemberSlotCount(inRight)).toBe(1);
        expect(inLeft).not.toBe(inRight);
        const inLeftSlots = Array.from(leftService.slotContentService.getBucketMemberSlots(inLeft));
        const inRightSlots = Array.from(rightService.slotContentService.getBucketMemberSlots(inRight));
        expect(inLeftSlots.map(slot => slot.key)).toEqual(['c1']);
        expect(inRightSlots.map(slot => slot.key)).toEqual(['c2']);
        expect(inLeftSlots[0] === cardsService.getSlotByKey(cards, 'c1')).toBe(true);
        expect(inRightSlots[0] === cardsService.getSlotByKey(cards, 'c2')).toBe(true);

        // And emptying one is a fact about that collection's bucket only.
        leftService.slotContentService.clearBucketMemberSlots(inLeft);
        expect(oimIsSlotReleased(inLeft)).toBe(true);
        expect(leftService.getSlotCount(left)).toBe(0);
        expect(rightService.getSlotByKey(right, 'k')).toBe(inRight);
    });

    it('a composite bucket takes its chain levels with it', () => {
        const { db, cardsService, cards } = createFixture();
        const tagsService = createOIMEntityService<TTag>(db, { keyOf: tag => tag.id });
        const tags = tagsService.createStoreSlot(db);
        let madeStore: { root: { childNodes: Map<unknown, unknown> } } | undefined;
        class CapturingTreeStore extends OIMSlotStoreServiceTreeDriven<
            TOIMEntitySlot, TOIMBucketSlot<TOIMBucketSlotsSetStore<TCardSlot>, TChain>
        > {
            public override createStore() {
                const store = super.createStore();
                madeStore = store as unknown as { root: { childNodes: Map<unknown, unknown> } };
                return store;
            }
        }
        const chainStore = new CapturingTreeStore(OIMDefaults.KEY_TREE_WALK_COMPOSITE.getValue());
        const compositeService = createOIMBucketService<
            TCardSlot, TChain, TOIMBucketSlotsSetStore<TCardSlot>, OIMSlotContentBucketServiceSetDriven<TCardSlot>, TChainBucketStore
        >(db, {
            slotContentService: new OIMSlotContentBucketServiceSetDriven<TCardSlot>(),
            bucketSlotStoreService: chainStore,
        });
        const composite = compositeService.createStoreSlot(db);
        tagsService.slotContentService.upsertEntity(tags, { id: 'd1' });
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deckId: 'd1' });
        db.flush();

        const chain: TChain = [tagsService.getSlotByKey(tags, 'd1')!, cardsService.getSlotByKey(cards, 'c1')!];
        const holdOnBucketSlot = compositeService.holdSlotByKey(composite, chain);
        const bucket = holdOnBucketSlot;
        compositeService.slotContentService.writeBucketMemberSlots(bucket, [cardsService.getSlotByKey(cards, 'c1')!]);
        // So the tree below is counted against the slot in it alone.
        holdOnBucketSlot.owner.unholdSlot(holdOnBucketSlot);

        const root = (madeStore as { root: { childNodes: Map<unknown, unknown> } }).root;
        expect(root.childNodes.size).toBe(1);

        compositeService.slotContentService.clearBucketMemberSlots(bucket);
        expect(root.childNodes.size).toBe(0);
    });
});

describe('a slot in two lists is in both of them', () => {
    it('appending it to the second list does not take it out of the first', () => {
        const { db, cardsService, cards } = createFixture();
        const { listService, list } = listOver(db);
        cardsService.slotContentService.upsertEntities(cards, [{ id: 'c1', deckId: 'd' }, { id: 'c2', deckId: 'd' }]);
        db.flush();

        const a = mintAt(listService, list, 'a');
        const b = mintAt(listService, list, 'b');
        const c1 = cardsService.getSlotByKey(cards, 'c1')!;
        listService.slotContentService.writeBucketMemberSlots(a, [c1]);
        db.flush();

        listService.slotContentService.insertBucketMemberSlotAt(b, listService.slotContentService.getBucketMemberSlotCount(b), c1);
        // So `holdCount` below counts two buckets holding it and not two fixtures.
        unhold();
        db.flush();

        expect(listService.getSlotByKey(list, 'a')).toBe(a);
        expect(listService.slotContentService.getBucketMemberSlotCount(a)).toBe(1);
        expect(listService.slotContentService.getBucketMemberSlotCount(b)).toBe(1);
        expect(c1.holdCount).toBe(2);
    });

    it('and the first list is let go only when the caller empties it', () => {
        const { db, cardsService, cards } = createFixture();
        const { listService, list } = listOver(db);
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deckId: 'd' });
        db.flush();

        const a = mintAt(listService, list, 'a');
        const b = mintAt(listService, list, 'b');
        const c1 = cardsService.getSlotByKey(cards, 'c1')!;
        listService.slotContentService.writeBucketMemberSlots(a, [c1]);
        db.flush();

        listService.slotContentService.insertBucketMemberSlotAt(b, listService.slotContentService.getBucketMemberSlotCount(b), c1);
        // `a` must be droppable by the clear below, and `b` is kept by the append
        // above — so both resolver holds go here.
        unhold();
        listService.slotContentService.clearBucketMemberSlots(a);
        db.flush();

        expect(oimIsSlotReleased(a)).toBe(true);
        expect(listService.slotContentService.getBucketMemberSlotCount(b)).toBe(1);
        expect(c1.holdCount).toBe(1);
    });
});

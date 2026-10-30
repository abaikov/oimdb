import { OIMDefaults } from '../../db/OIMDefaults';
import { OIMDB, OIMEffectService, OIMSlotContentPositionalArrayBucketService, OIMSlotContentSetBucketService, OIMSlotTreeStoreService, oimIsSlotEmpty, oimIsSlotReleased } from '../../index';
import type { TOIMBucketSlot, TOIMEntitySlot, TOIMBucketSlotsSetStore, TOIMSlot } from '../../index';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';
import { createOIMSlotContentEntityService } from '../../entity/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../createOIMSlotCollectionService';

type TCard = { id: string; deckId: string };
type TTag = { id: string };
type TCardSlot = TOIMEntitySlot<TCard, TOIMStoreKey>;
type TChain = readonly TOIMEntitySlot[];

function createFixture() {
    const db = new OIMDB();
    const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard>(db) });
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

function byDeckIndex(db: OIMDB, slotContentService = new OIMSlotContentSetBucketService<TCardSlot>()) {
    const byDeckService = createOIMSlotCollectionService(db, { slotContentService });
    return { byDeckService, byDeck: byDeckService.createStoreSlot(db) };
}

/** A positional list: the caller places the slots, so the service sorts nothing. */
function listOver(db: OIMDB) {
    const listService = createOIMSlotCollectionService(db, { slotContentService: new OIMSlotContentPositionalArrayBucketService<TCardSlot>() });
    return { listService, list: listService.createStoreSlot(db) };
}

describe('a bucket nobody holds does not outlive its last slot', () => {

    it('removing the entity leaves the slot, and the bucket, where the caller put them', () => {
        const { db, cardsService, cards } = createFixture();
        const { byDeckService, byDeck } = byDeckIndex(db);
        cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', deckId: 'd1' });
        db.flush();
        const d1 = mintAt(byDeckService, byDeck, 'd1');
        const card = cardsService.getSlotByKey(cards, 'c1')!;
        byDeckService.slotContentService.writeSlotContent(d1, [card]);
        // So that the bucket surviving the removal below is THE SLOT IN IT
        // doing it and not this fixture's.
        unhold();

        cardsService.slotContentService.clearSlotContent(card);
        db.flush();

        expect(oimIsSlotEmpty(card)).toBe(true);
        expect(byDeckService.getSlotByKey(byDeck, 'd1')).toBe(d1);
        expect(byDeckService.slotContentService.getBucketMemberSlotCount(d1)).toBe(1);
        // The slot in it is the whole of what keeps it — one reference, counted
        // on that slot.
        expect(card.holdCount).toBe(1);
    });

    it('a bucket the caller is holding survives being emptied, and is refilled through the hold', () => {
        const { db, cardsService, cards } = createFixture();
        const { listService, list } = listOver(db);
        cardsService.writeInBatch(cards, () => ([{ id: 'c1', deckId: 'd1' }, { id: 'c2', deckId: 'd1' }]).map(entity => cardsService.writeSlotContentByKey(cards, entity.id, entity)));
        db.flush();

        // The reference a caller keeps — nothing is subscribed to it yet, which
        // is the ordinary state of a list being hydrated before anything renders.
        const heldSlot = listService.holdSlotByKey(list, 'ann-today');
        const bucket = heldSlot;
        listService.slotContentService.writeSlotContent(bucket, [cardsService.getSlotByKey(cards, 'c1')!]);
        db.flush();

        listService.slotContentService.clearSlotContent(bucket);
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
        listService.slotContentService.clearSlotContent(bucket);
        expect(listService.getSlotByKey(list, 'ann-today')).toBe(bucket);
        heldSlot.owner.unholdSlot(heldSlot);
        expect(oimIsSlotReleased(bucket)).toBe(true);
        expect(listService.getSlotCount(list)).toBe(0);
    });

    it('a bucket nobody holds is let go by the write that empties it, and not a frame later', () => {
        const { db, cardsService, cards } = createFixture();
        const { listService, list } = listOver(db);
        cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', deckId: 'd1' });
        db.flush();

        const bucket = mintAt(listService, list, 'ann-today');
        listService.slotContentService.writeSlotContent(bucket, [cardsService.getSlotByKey(cards, 'c1')!]);
        // "A BUCKET NOBODY HOLDS" is the title, so the resolver's hold goes here.
        unhold();
        db.flush();

        // No hold, no effect, no slot: the call that took the last one out is
        // where the answer is given.
        listService.slotContentService.clearSlotContent(bucket);
        expect(oimIsSlotReleased(bucket)).toBe(true);
        expect(listService.getSlotCount(list)).toBe(0);
    });

    it('letting go of a stale bucket does not take the live one under its key with it', () => {
        const { db, cardsService, cards } = createFixture();
        const { byDeckService, byDeck } = byDeckIndex(db);
        cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', deckId: 'd1' });
        db.flush();

        const stale = mintAt(byDeckService, byDeck, 'q');
        // The resolver's hold IS the last reference, so handing it back is what
        // unfiles this one.
        unhold();
        const live = mintAt(byDeckService, byDeck, 'q');
        expect(live).not.toBe(stale);

        byDeckService.slotContentService.writeSlotContent(live, [cardsService.getSlotByKey(cards, 'c1')!]);
        OIMEffectService.INSTANCE.createEffect(db, () => { /* held by an effect */ }, [live]);
        unhold();
        db.flush();

        // The dead one refuses, and by key alone this deleted the live bucket
        // instead: full, subscribed to, and gone without a word.
        expect(() => byDeckService.slotContentService.clearSlotContent(stale)).toThrow(/This identity was released/);
        expect(byDeckService.getSlotByKey(byDeck, 'q')).toBe(live);
        expect(byDeckService.slotContentService.getBucketMemberSlotCount(live)).toBe(1);
    });

    it('two collections over one bucket service do not disturb each other', () => {
        const { db, cardsService, cards } = createFixture();
        // ONE service, TWO collections — the construction the latch refused.
        const service = new OIMSlotContentSetBucketService<TCardSlot>();
        const { byDeckService: leftService, byDeck: left } = byDeckIndex(db, service);
        const { byDeckService: rightService, byDeck: right } = byDeckIndex(db, service);
        cardsService.writeInBatch(cards, () => ([{ id: 'c1', deckId: 'd1' }, { id: 'c2', deckId: 'd1' }]).map(entity => cardsService.writeSlotContentByKey(cards, entity.id, entity)));
        db.flush();

        const inLeft = mintAt(leftService, left, 'k');
        const inRight = mintAt(rightService, right, 'k');
        leftService.slotContentService.writeSlotContent(inLeft, [cardsService.getSlotByKey(cards, 'c1')!]);
        rightService.slotContentService.writeSlotContent(inRight, [cardsService.getSlotByKey(cards, 'c2')!]);
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
        leftService.slotContentService.clearSlotContent(inLeft);
        expect(oimIsSlotReleased(inLeft)).toBe(true);
        expect(leftService.getSlotCount(left)).toBe(0);
        expect(rightService.getSlotByKey(right, 'k')).toBe(inRight);
    });

    it('a composite bucket takes its chain levels with it', () => {
        const { db, cardsService, cards } = createFixture();
        const tagsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TTag, string>(db) });
        const tags = tagsService.createStoreSlot(db);
        let madeStore: { rootCompositeKeyNode: { childNodes: Map<unknown, unknown> } } | undefined;
        class CapturingTreeStore extends OIMSlotTreeStoreService<
            TOIMEntitySlot, TOIMBucketSlot<TOIMBucketSlotsSetStore<TCardSlot>, TChain>
        > {
            public override createStore() {
                const store = super.createStore();
                madeStore = store as unknown as { rootCompositeKeyNode: { childNodes: Map<unknown, unknown> } };
                return store;
            }
        }
        const chainStore = new CapturingTreeStore(OIMDefaults.COMPOSITE_KEY_TREE_WALK.getValue());
        const compositeService = createOIMSlotCollectionService(db, { slotContentService: new OIMSlotContentSetBucketService<TCardSlot, TChain>(), slotStoreService: chainStore });
        const composite = compositeService.createStoreSlot(db);
        tagsService.writeSlotContentByKey(tags, 'd1', { id: 'd1' });
        cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', deckId: 'd1' });
        db.flush();

        const chain: TChain = [tagsService.getSlotByKey(tags, 'd1')!, cardsService.getSlotByKey(cards, 'c1')!];
        const holdOnBucketSlot = compositeService.holdSlotByKey(composite, chain);
        const bucket = holdOnBucketSlot;
        compositeService.slotContentService.writeSlotContent(bucket, [cardsService.getSlotByKey(cards, 'c1')!]);
        // So the tree below is counted against the slot in it alone.
        holdOnBucketSlot.owner.unholdSlot(holdOnBucketSlot);

        const root = (madeStore as { rootCompositeKeyNode: { childNodes: Map<unknown, unknown> } }).rootCompositeKeyNode;
        expect(root.childNodes.size).toBe(1);

        compositeService.slotContentService.clearSlotContent(bucket);
        expect(root.childNodes.size).toBe(0);
    });
});

describe('a slot in two lists is in both of them', () => {
    it('appending it to the second list does not take it out of the first', () => {
        const { db, cardsService, cards } = createFixture();
        const { listService, list } = listOver(db);
        cardsService.writeInBatch(cards, () => ([{ id: 'c1', deckId: 'd' }, { id: 'c2', deckId: 'd' }]).map(entity => cardsService.writeSlotContentByKey(cards, entity.id, entity)));
        db.flush();

        const a = mintAt(listService, list, 'a');
        const b = mintAt(listService, list, 'b');
        const c1 = cardsService.getSlotByKey(cards, 'c1')!;
        listService.slotContentService.writeSlotContent(a, [c1]);
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
        cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', deckId: 'd' });
        db.flush();

        const a = mintAt(listService, list, 'a');
        const b = mintAt(listService, list, 'b');
        const c1 = cardsService.getSlotByKey(cards, 'c1')!;
        listService.slotContentService.writeSlotContent(a, [c1]);
        db.flush();

        listService.slotContentService.insertBucketMemberSlotAt(b, listService.slotContentService.getBucketMemberSlotCount(b), c1);
        // `a` must be droppable by the clear below, and `b` is kept by the append
        // above — so both resolver holds go here.
        unhold();
        listService.slotContentService.clearSlotContent(a);
        db.flush();

        expect(oimIsSlotReleased(a)).toBe(true);
        expect(listService.slotContentService.getBucketMemberSlotCount(b)).toBe(1);
        expect(c1.holdCount).toBe(1);
    });
});

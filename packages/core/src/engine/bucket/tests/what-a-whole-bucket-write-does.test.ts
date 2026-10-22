import {
    OIMDB,
    OIMEffectService,
    OIMSlotContentBucketServiceArrayDriven,
    createOIMBucketService,
    createOIMEntityService,
} from '../../../index';
import type { TOIMEntitySlot, TOIMBucketSlotsArrayStore } from '../../../index';

type TCard = { id: string; deckId: string; day: string; title: string; rank: number };
type TCardSlot = TOIMEntitySlot<TCard, string>;

const expectSlotsToBe = (
    got: Iterable<TOIMEntitySlot<TCard>>, wanted: readonly TOIMEntitySlot<TCard>[],
): void => {
    const slots = Array.from(got);
    expect(slots.map(slot => slot.key)).toEqual(wanted.map(slot => slot.key));
    for (let at = 0; at < wanted.length; at++) expect(slots[at] === wanted[at]).toBe(true);
};

describe('what a whole-bucket write does', () => {
    function setupManual() {
        const db = new OIMDB();
        const cardsService = createOIMEntityService(db, { keyOf: (card: TCard) => card.id });
        // The caller's list, in the caller's order, IS what the
        // bucket holds here, which is what a page of ids from a server is.
        const cards = cardsService.createStoreSlot(db);
        const membersService = new OIMSlotContentBucketServiceArrayDriven<TCardSlot>();
        const searchService = createOIMBucketService<
            TCardSlot, string, TOIMBucketSlotsArrayStore<TCardSlot>, OIMSlotContentBucketServiceArrayDriven<TCardSlot>
        >(db, { slotContentService: membersService });
        // MINTED THROUGH THE ONE DOOR, AND THE REFERENCE IS KEPT for the life of
        // the fixture. A give-back on the next line runs before any case has put
        // anything in the bucket, and `OIMSlotOwner.unholdSlot` asks
        // `releaseSlotIfUnheld`, which unfiles an empty bucket — every case would
        // then write into a bucket the collection had forgotten, with
        // `buckets.getSlotByKey('q')` answering `undefined`.
        //
        // Nothing here asks when this bucket is DROPPED, so the hold simply stands
        // for the whole case; the file that does ask that question hands its hold
        // back at the line it is asking about (`index-pairings`).
        const search = searchService.createStoreSlot(db);
        searchService.holdSlotByKey(search, 'q');
        const heldSlot = searchService.getSlotByKey(search, 'q');
        return { db, cardsService, cards, membersService, searchService, search, q: heldSlot };
    }

    /**
     * A key whose entity has not arrived, and THE HOLD THAT KEEPS IT until a
     * bucket does. Same repair, same reason: a bucket's slots are written by the
     * caller on a later line, so a give-back taken here is taken while nothing at
     * all points at the slot. `cards.slots.size` counts both of these either way,
     * because the hold keeps exactly the identity the bucket would.
     */
    const reserved = (
        cardsService: ReturnType<typeof setupManual>['cardsService'], cards: ReturnType<typeof setupManual>['cards'], id: string,
    ): TCardSlot => cardsService.holdSlotByKey(cards, id);

    it('write sets exactly the slots it names', () => {
        const { db, cardsService, cards, membersService, q } = setupManual();
        cardsService.slotContentService.upsertEntities(cards, [
            { id: 'c1', deckId: 'd1', day: 'd', title: 'a', rank: 0 },
            { id: 'c2', deckId: 'd1', day: 'd', title: 'b', rank: 1 },
            { id: 'c3', deckId: 'd1', day: 'd', title: 'c', rank: 2 },
        ]);
        db.flush();
        const c1 = cardsService.getSlotByKey(cards, 'c1')!;
        const c3 = cardsService.getSlotByKey(cards, 'c3')!;

        membersService.writeBucketMemberSlots(q,[c3, c1]);
        expectSlotsToBe(membersService.getBucketMemberSlots(q),[c3, c1]);
    });

    it('re-setting the identical list changes nothing and wakes nobody', () => {
        const { db, cardsService, cards, membersService, q } = setupManual();
        cardsService.slotContentService.upsertEntities(cards, [
            { id: 'c1', deckId: 'd1', day: 'd', title: 'a', rank: 0 },
            { id: 'c2', deckId: 'd1', day: 'd', title: 'b', rank: 1 },
        ]);
        db.flush();
        const c1 = cardsService.getSlotByKey(cards, 'c1')!;
        const c2 = cardsService.getSlotByKey(cards, 'c2')!;
        membersService.writeBucketMemberSlots(q,[c1, c2]);
        // DELIVERED FIRST, and the test says nothing without this line. That
        // `write` is a real change — the bucket was empty — so leaving it
        // undelivered means the effect below is born behind a write of the OPEN
        // batch, inherits it, and runs at the very flush this case is measuring.
        // What the name promises to measure is the SECOND call, so the first one
        // has to be over.
        db.flush();

        let runCount = 0;
        OIMEffectService.INSTANCE.createEffect(db, [q], [], () => { runCount++; });
        membersService.writeBucketMemberSlots(q,[c1, c2]);
        db.flush();

        expect(runCount).toBe(0);
        expectSlotsToBe(membersService.getBucketMemberSlots(q),[c1, c2]);
    });

    it('evicted slots are truly out (assert via slot.holdCount)', () => {
        const { db, cardsService, cards, membersService, q } = setupManual();
        cardsService.slotContentService.upsertEntities(cards, [
            { id: 'c1', deckId: 'd1', day: 'd', title: 'a', rank: 0 },
            { id: 'c2', deckId: 'd1', day: 'd', title: 'b', rank: 1 },
            { id: 'c3', deckId: 'd1', day: 'd', title: 'c', rank: 2 },
        ]);
        db.flush();
        const c1 = cardsService.getSlotByKey(cards, 'c1')!;
        const c2 = cardsService.getSlotByKey(cards, 'c2')!;
        const c3 = cardsService.getSlotByKey(cards, 'c3')!;

        membersService.writeBucketMemberSlots(q,[c1, c2, c3]);
        expect(c2.holdCount).toBe(1);

        membersService.writeBucketMemberSlots(q,[c1, c3]);
        expect(c2.holdCount).toBe(0);
        expectSlotsToBe(membersService.getBucketMemberSlots(q),[c1, c3]);
    });

    it('replacing every slot in the bucket keeps the bucket the collection filed', () => {
        const { db, cardsService, cards, membersService, searchService, search, q } = setupManual();
        cardsService.slotContentService.upsertEntities(cards, [
            { id: 'c1', deckId: 'd1', day: 'd', title: 'a', rank: 0 },
            { id: 'c2', deckId: 'd1', day: 'd', title: 'b', rank: 1 },
        ]);
        db.flush();
        // Nobody is subscribed and nobody holds the bucket — the ordinary state
        // of a list being hydrated before anything renders, and all this ever
        // needed.
        const c1 = cardsService.getSlotByKey(cards, 'c1')!;
        const c2 = cardsService.getSlotByKey(cards, 'c2')!;
        membersService.writeBucketMemberSlots(q,[c1]);
        db.flush();

        // Evicting one slot at a time took the bucket through empty, the
        // release fired, the collection dropped it — and the join below then
        // filled a bucket the collection no longer owned. Two live buckets for
        // one key, and nothing thrown.
        membersService.writeBucketMemberSlots(q,[c2]);

        expect(searchService.getSlotByKey(search, 'q')).toBe(q);
        expect(searchService.getSlotCount(search)).toBe(1);
        expectSlotsToBe(membersService.getBucketMemberSlots(q),[c2]);
        db.flush();
        expect(searchService.getSlotByKey(search, 'q')).toBe(q);
    });

    it('a reserved identity that leaves and arrives in the same write stays the collection\'s', () => {
        const { db, cardsService, cards, membersService, q } = setupManual();
        // Ids from a server's ordered page whose entities have not arrived:
        // nothing points at them but this bucket.
        const g1 = reserved(cardsService, cards, 'g1');
        const g2 = reserved(cardsService, cards, 'g2');
        membersService.writeBucketMemberSlots(q,[g1, g2]);
        db.flush();

        // A reorder — every slot leaves and every slot arrives again.
        membersService.writeBucketMemberSlots(q,[g2, g1]);
        db.flush();
        expectSlotsToBe(membersService.getBucketMemberSlots(q),[g2, g1]);
        // Still the same identities the collection files under those keys.
        expect(cardsService.getSlotByKey(cards, 'g1')).toBe(g1);
        expect(cardsService.getSlotCount(cards)).toBe(2);
    });

    /**
     * Hydrating a snapshot is this call and nothing else. Nothing would put the
     * list back on its own: no column says it, no entity carries it, and the
     * order is the server's rather than a sorter's. There is one kind of
     * index, so restoring is writing.
     */
    it('a restored snapshot puts back the slots its caller decided, in its order', () => {
        const { db, cardsService, cards, membersService, q } = setupManual();
        cardsService.slotContentService.upsertEntities(cards, [
            { id: 'c1', deckId: 'd1', day: '08-01', title: 'a', rank: 0 },
            { id: 'c2', deckId: 'd1', day: '08-02', title: 'b', rank: 1 },
        ]);
        db.flush();

        membersService.writeBucketMemberSlots(q,[cardsService.getSlotByKey(cards, 'c2')!, cardsService.getSlotByKey(cards, 'c1')!]);
        db.flush();

        expectSlotsToBe(membersService.getBucketMemberSlots(q),[cardsService.getSlotByKey(cards, 'c2')!, cardsService.getSlotByKey(cards, 'c1')!]);
    });
});

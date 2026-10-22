import {
    OIMDB, OIMEffectService, OIMSlotContentBucketServiceSetDriven, createOIMBucketService, createOIMEntityService,
} from '../../../index';
import type { TOIMBucketSlot } from '../types/TOIMBucketSlot';
import type { TOIMBucketSlotsSetStore } from '../types/TOIMBucketSlotsSetStore';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import { oimIsSlotReleased } from '../../slot/utils/oimIsSlotReleased';

type Card = { id: string; deck: string; rank: number };
type TCardSlot = TOIMEntitySlot<Card, string>;
type TDeck = TOIMBucketSlot<TOIMBucketSlotsSetStore<TCardSlot>, string>;

const createFixture =() => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService(db, { keyOf: (card: Card) => card.id });
    const cards = cardsService.createStoreSlot(db);
    return { db, cardsService, cards };
};

const unorderedIndex = (db: OIMDB) => {
    const membersService = new OIMSlotContentBucketServiceSetDriven<TCardSlot>();
    const indexService = createOIMBucketService<
        TCardSlot, string, TOIMBucketSlotsSetStore<TCardSlot>, OIMSlotContentBucketServiceSetDriven<TCardSlot>
    >(db, { slotContentService: membersService });
    const index = indexService.createStoreSlot(db);
    // See {@link reservations}: whatever the previous case is still holding is a
    // hold on a collection nothing can reach any more.
    reservations.length = 0;
    return { indexService, membersService, index };
};

/**
 * The give-backs {@link bucketFor} is still holding. Emptied by
 * {@link withBuckets}, which every case calls before its first `bucketFor`, so a
 * case never inherits the previous one's — those are holds on a collection
 * already thrown away.
 */
const reservations: (() => void)[] = [];

/**
 * The bucket at a key, minted if there is none.
 *
 * A HOLD IS THE DOOR AND THE HOLD IS KEPT. Giving it back on the next line
 * unfiles the bucket: its slots are written by the CALLER one line later,
 * and `OIMSlotOwner.unholdSlot` asks `releaseSlotIfUnheld`, which keeps
 * nothing for an empty bucket. Every case here would then read and write a
 * bucket its collection had forgotten, with `decks.getSlotByKey(key)` answering
 * `undefined` for a bucket that is plainly there.
 *
 * The hold is handed back by {@link handBackBuckets}, which the one case that
 * asks when a bucket is DROPPED calls at the point it is about. The other cases
 * never call it and do not need to: they assert what a bucket holds, and a hold
 * standing over that is invisible to every one of them.
 */
const bucketFor = (
    indexService: ReturnType<typeof unorderedIndex>['indexService'],
    index: ReturnType<typeof unorderedIndex>['index'],
    key: string,
): TDeck => {
    const heldSlot = indexService.holdSlotByKey(index, key);
    reservations.push(() => { heldSlot.owner.unholdSlot(heldSlot); });
    return heldSlot;
};

/**
 * Give back what {@link bucketFor} took, so that from here on the bucket is kept
 * by the slots and the subscribers a case actually put on it — which is the
 * state a idleWindow question has to be asked in.
 */
const handBackBuckets = (): void => {
    for (const release of reservations) release();
    reservations.length = 0;
};

describe('a manual index holds what it was told to hold', () => {
    it('reads back the slots it was set', () => {
        const { db, cardsService, cards } = createFixture();
        const { indexService: byDeckService, membersService, index: byDeck } = unorderedIndex(db);
        cardsService.slotContentService.upsertEntities(cards, [
            { id: 'a', deck: 'red', rank: 2 },
            { id: 'b', deck: 'red', rank: 1 },
            { id: 'c', deck: 'blue', rank: 3 },
        ]);

        const red = bucketFor(byDeckService, byDeck, 'red');
        membersService.writeBucketMemberSlots(red, [cardsService.getSlotByKey(cards, 'a')!, cardsService.getSlotByKey(cards, 'b')!]);
        db.flush();

        const held = Array.from(membersService.getBucketMemberSlots(red)).map((slot) => slot.entity?.id);
        expect(held.sort()).toEqual(['a', 'b']);
        expect(membersService.getBucketMemberSlotCount(red)).toBe(2);
    });

    it('sets nothing and wakes nobody when the slots are unchanged', () => {
        const { db, cardsService, cards } = createFixture();
        const { indexService: byDeckService, membersService, index: byDeck } = unorderedIndex(db);
        cardsService.slotContentService.upsertEntities(cards, [{ id: 'a', deck: 'red', rank: 1 }, { id: 'b', deck: 'red', rank: 2 }]);
        const red = bucketFor(byDeckService, byDeck, 'red');
        const slots = [cardsService.getSlotByKey(cards, 'a')!, cardsService.getSlotByKey(cards, 'b')!];
        membersService.writeBucketMemberSlots(red, slots);
        db.flush();

        let runs = 0;
        OIMEffectService.INSTANCE.createEffect(db, [red], [], () => { runs++; });
        db.flush();
        runs = 0;

        // The same slots again, in the other order. A set holds no order, so
        // these are the slots it already holds.
        membersService.writeBucketMemberSlots(red, [slots[1], slots[0]]);
        db.flush();
        expect(runs).toBe(0);
    });

    it('wakes a subscriber of the bucket when the slots do change', () => {
        const { db, cardsService, cards } = createFixture();
        const { indexService: byDeckService, membersService, index: byDeck } = unorderedIndex(db);
        cardsService.slotContentService.upsertEntities(cards, [{ id: 'a', deck: 'red', rank: 1 }, { id: 'b', deck: 'red', rank: 2 }]);
        const red = bucketFor(byDeckService, byDeck, 'red');
        membersService.writeBucketMemberSlots(red, [cardsService.getSlotByKey(cards, 'a')!]);
        db.flush();

        let runs = 0;
        OIMEffectService.INSTANCE.createEffect(db, [red], [], () => { runs++; });
        db.flush();
        runs = 0;

        membersService.writeBucketMemberSlots(red, [cardsService.getSlotByKey(cards, 'a')!, cardsService.getSlotByKey(cards, 'b')!]);
        db.flush();
        expect(runs).toBe(1);
        expect(membersService.getBucketMemberSlotCount(red)).toBe(2);
    });

    it('empties a bucket and hands every slot back', () => {
        const { db, cardsService, cards } = createFixture();
        const { indexService: byDeckService, membersService, index: byDeck } = unorderedIndex(db);
        cardsService.slotContentService.upsertEntities(cards, [{ id: 'a', deck: 'red', rank: 1 }, { id: 'b', deck: 'red', rank: 2 }]);
        const red = bucketFor(byDeckService, byDeck, 'red');
        membersService.writeBucketMemberSlots(red, [cardsService.getSlotByKey(cards, 'a')!, cardsService.getSlotByKey(cards, 'b')!]);
        db.flush();

        membersService.clearBucketMemberSlots(red);
        db.flush();
        expect(membersService.getBucketMemberSlotCount(red)).toBe(0);
    });
});

describe('a bucket nothing holds is let go of', () => {
    it('keeps a bucket an effect is subscribed to, and drops it once nothing is', () => {
        const { db, cardsService, cards } = createFixture();
        const { indexService: byDeckService, membersService, index: byDeck } = unorderedIndex(db);
        cardsService.slotContentService.upsertEntity(cards, { id: 'a', deck: 'red', rank: 1 });
        const red = bucketFor(byDeckService, byDeck, 'red');
        membersService.writeBucketMemberSlots(red, [cardsService.getSlotByKey(cards, 'a')!]);
        db.flush();

        const effect = OIMEffectService.INSTANCE.createEffect(db, [red], [], () => { /* nothing */ });
        // The resolver's own hold goes back here: before this line the bucket is
        // kept by three things, after it by the effect alone, which is what makes
        // the assertions below about the subscriber and about nothing else.
        handBackBuckets();
        membersService.clearBucketMemberSlots(red);
        db.flush();
        // Empty, but subscribed: the identity stays, so the same key resolves
        // to the same object.
        expect(byDeckService.getSlotByKey(byDeck, 'red')).toBe(red);

        OIMEffectService.INSTANCE.disposeEffect(effect);
        expect(oimIsSlotReleased(red)).toBe(true);
        expect(byDeckService.getSlotCount(byDeck)).toBe(0);
    });
});

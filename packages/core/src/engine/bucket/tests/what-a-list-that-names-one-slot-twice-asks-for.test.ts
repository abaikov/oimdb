import { OIMDB, OIMEffectService, OIMSlotContentBucketServiceArrayDriven, createOIMBucketService, createOIMEntityService } from '../../../index';
import { OIMBucketArrayMembershipUnique } from '../array/OIMBucketArrayMembershipUnique';
import type { TOIMBucketSlot } from '../types/TOIMBucketSlot';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMBucketSlotsArrayUniqueStore } from '../array/types/TOIMBucketSlotsArrayUniqueStore';

type Card = { id: string; rank: number };
type TCardSlot = TOIMEntitySlot<Card, string>;
type TDeck = TOIMBucketSlot<TOIMBucketSlotsArrayUniqueStore<TCardSlot>, string>;

const createFixture =() => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService(db, { keyOf: (card: Card) => card.id });
    const membersService = new OIMSlotContentBucketServiceArrayDriven<TCardSlot, TOIMBucketSlotsArrayUniqueStore<TCardSlot>>({
        bucketArrayMembership: new OIMBucketArrayMembershipUnique<TCardSlot>(),
    });
    const decksService = createOIMBucketService<
        TCardSlot, string, TOIMBucketSlotsArrayUniqueStore<TCardSlot>,
        OIMSlotContentBucketServiceArrayDriven<TCardSlot, TOIMBucketSlotsArrayUniqueStore<TCardSlot>>
    >(db, { slotContentService: membersService });
    const cards = cardsService.createStoreSlot(db);
    const decks = decksService.createStoreSlot(db);
    const put = (id: string, rank: number): TCardSlot => cardsService.slotContentService.upsertEntity(cards, { id, rank });
    const idsIn = (bucket: TDeck): (string | undefined)[] =>
        [...membersService.getBucketMemberSlots(bucket)].map((slot) => slot.entity?.id);
    return { db, membersService, decksService, decks, put, idsIn };
};

describe('a list that names one slot twice, against a bucket that holds each once', () => {
    it('takes the slot the caller named and drops the one they did not', () => {
        const { db, membersService, decksService, decks, put, idsIn } = createFixture();
        const a = put('a', 10);
        const b = put('b', 20);
        const heldSlot = decksService.holdSlotByKey(decks, 'deck');
        membersService.writeBucketMemberSlots(heldSlot,[a, b]);
        db.flush();
        expect(idsIn(heldSlot)).toEqual(['a', 'b']);

        // `[a, a]` asks for `{a}`. The counts agree with `{a, b}` at two and both
        // lookups find `a` — the pair of facts a count-and-presence answer takes
        // for "nothing changed".
        membersService.writeBucketMemberSlots(heldSlot,[a, a]);
        db.flush();

        expect(idsIn(heldSlot)).toEqual(['a']);
        heldSlot.owner.unholdSlot(heldSlot);
    });

    it('wakes a subscriber for that write, rather than calling it unchanged', () => {
        const { db, membersService, decksService, decks, put } = createFixture();
        const a = put('a', 10);
        const b = put('b', 20);
        const heldSlot = decksService.holdSlotByKey(decks, 'deck');
        membersService.writeBucketMemberSlots(heldSlot,[a, b]);
        db.flush();

        let runCount = 0;
        OIMEffectService.INSTANCE.createEffect(db, [heldSlot], [], () => { runCount++; });
        db.flush();
        const before = runCount;

        membersService.writeBucketMemberSlots(heldSlot,[a, a]);
        db.flush();

        // The silent half: a bucket that keeps a slot nobody asked for and tells
        // nobody leaves a reader no way to notice.
        expect(runCount).toBe(before + 1);
        heldSlot.owner.unholdSlot(heldSlot);
    });

    it('still calls a genuinely unchanged poll unchanged, and a reordered one a change', () => {
        const { db, membersService, decksService, decks, put } = createFixture();
        const a = put('a', 10);
        const b = put('b', 20);
        const heldSlot = decksService.holdSlotByKey(decks, 'deck');
        membersService.writeBucketMemberSlots(heldSlot,[a, b]);
        db.flush();

        let runCount = 0;
        OIMEffectService.INSTANCE.createEffect(db, [heldSlot], [], () => { runCount++; });
        db.flush();
        const before = runCount;

        // The case the fast path exists for, and the one the fix must not cost:
        // the same two slots, re-sent.
        membersService.writeBucketMemberSlots(heldSlot,[a, b]);
        db.flush();
        expect(runCount).toBe(before);

        membersService.writeBucketMemberSlots(heldSlot,[b, a]);
        db.flush();
        expect(runCount).toBe(before + 1);

        heldSlot.owner.unholdSlot(heldSlot);
    });

    it('calls a repeat of exactly what is held unchanged, and leaves the bucket alone', () => {
        const { db, membersService, decksService, decks, put, idsIn } = createFixture();
        const a = put('a', 10);
        const heldSlot = decksService.holdSlotByKey(decks, 'deck');
        membersService.writeBucketMemberSlots(heldSlot,[a]);
        db.flush();

        // `[a, a]` against `{a}`: the second mention records nothing, so setting
        // this list would change nothing a reader can see.
        membersService.writeBucketMemberSlots(heldSlot,[a, a]);
        db.flush();
        expect(idsIn(heldSlot)).toEqual(['a']);

        heldSlot.owner.unholdSlot(heldSlot);
    });

    it('answers an empty poll against an empty bucket without asking the set anything', () => {
        const { db, membersService, decksService, decks, put, idsIn } = createFixture();
        const a = put('a', 10);
        const heldSlot = decksService.holdSlotByKey(decks, 'deck');
        membersService.writeBucketMemberSlots(heldSlot,[a]);
        db.flush();

        membersService.writeBucketMemberSlots(heldSlot,[]);
        db.flush();
        expect(idsIn(heldSlot)).toEqual([]);

        // The nought-and-one shape the fix leaves allocation-free.
        membersService.writeBucketMemberSlots(heldSlot,[]);
        db.flush();
        expect(idsIn(heldSlot)).toEqual([]);

        heldSlot.owner.unholdSlot(heldSlot);
    });
});

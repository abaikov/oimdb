import {
    OIMDB, OIMEffectService, OIMSlotContentBucketServiceArrayDriven, OIMSlotContentBucketServiceSetDriven,
    createOIMBucketService, createOIMEntityService,
} from '../../../index';
import { OIMBucketArrayMembershipUnique } from '../array/OIMBucketArrayMembershipUnique';
import type { TOIMBucketSlot } from '../types/TOIMBucketSlot';
import type { TOIMBucketSlotsSetStore } from '../types/TOIMBucketSlotsSetStore';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMBucketSlotsArrayUniqueStore } from '../array/types/TOIMBucketSlotsArrayUniqueStore';

type Card = { id: string; rank: number };
type TCardSlot = TOIMEntitySlot<Card, string>;
type TDeck = TOIMBucketSlot<TOIMBucketSlotsArrayUniqueStore<TCardSlot>, string>;

const setReconcileFindsNothing = (db: OIMDB, held: readonly TCardSlot[], slots: readonly TCardSlot[]): boolean => {
    const membersService = new OIMSlotContentBucketServiceSetDriven<TCardSlot>();
    const setsService = createOIMBucketService<TCardSlot, string, TOIMBucketSlotsSetStore<TCardSlot>, OIMSlotContentBucketServiceSetDriven<TCardSlot>>(
        db, { slotContentService: membersService },
    );
    const bucket = setsService.holdSlotByKey(setsService.createStoreSlot(db), 'held');
    membersService.addBucketMemberSlots(bucket, held);
    return !membersService.writeBucketMemberSlots(bucket, slots);
};

const named = (): { db: OIMDB; slots: Record<string, TCardSlot> } => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService(db, { keyOf: (card: Card) => card.id });
    const cards = cardsService.createStoreSlot(db);
    return {
        db,
        slots: {
            a: cardsService.slotContentService.upsertEntity(cards, { id: 'a', rank: 1 }),
            b: cardsService.slotContentService.upsertEntity(cards, { id: 'b', rank: 2 }),
            c: cardsService.slotContentService.upsertEntity(cards, { id: 'c', rank: 3 }),
        },
    };
};

/**
 * Every shape the two can differ on, and every shape they must keep agreeing on:
 * an empty poll either way, a repeat that asks for exactly what is held, a repeat
 * that hides a slot the caller never named, a longer list, a shorter one.
 */
const CASES: readonly { held: string; asks: string }[] = [
    { held: '', asks: '' },
    { held: '', asks: 'a' },
    { held: 'a', asks: '' },
    { held: 'a', asks: 'a' },
    { held: 'a', asks: 'aa' },
    { held: 'a', asks: 'aaa' },
    { held: 'a', asks: 'b' },
    { held: 'a', asks: 'ab' },
    { held: 'ab', asks: 'a' },
    { held: 'ab', asks: 'ab' },
    { held: 'ab', asks: 'ba' },
    { held: 'ab', asks: 'aa' },
    { held: 'ab', asks: 'aab' },
    { held: 'ab', asks: 'aabb' },
    { held: 'ab', asks: 'abc' },
    { held: 'ac', asks: 'abb' },
    { held: 'abc', asks: 'abc' },
    { held: 'abc', asks: 'aabbcc' },
    { held: 'abc', asks: 'ab' },
];

const firstMentions = (asks: string): string => [...new Set(asks)].join('');

describe('two bodies for one question', () => {
    it('answer the same thing about every list whose first mentions keep the held order', () => {
        const bucketArrayMembershipUnique = new OIMBucketArrayMembershipUnique<TCardSlot>();
        const disagreed: string[] = [];
        for (const { held, asks } of CASES) {
            const { db, slots } = named();
            const heldSlots = [...held].map(id => slots[id]);
            const list = [...asks].map(id => slots[id]);

            const bucketSlotsArrayUniqueStore = bucketArrayMembershipUnique.createStore();
            for (const id of held) {
                bucketArrayMembershipUnique.addSlot(bucketSlotsArrayUniqueStore, slots[id]);
                bucketSlotsArrayUniqueStore.bucketMemberSlots.push(slots[id]);
            }

            const bySet = setReconcileFindsNothing(db, heldSlots, list) && firstMentions(asks) === held;
            const byUnique = bucketArrayMembershipUnique.containsTheSameSequence(bucketSlotsArrayUniqueStore, list);
            if (bySet === byUnique) continue;
            disagreed.push(`{${held}} asked for [${asks}] — set reconcile in held order ${bySet}, distinct ${byUnique}`);
        }
        expect(disagreed).toEqual([]);
    });

    /**
     * The answer itself, stated rather than only compared: two bodies agreeing on
     * the wrong answer would pass the case above.
     */
    it('and the answer to a repeat of exactly what is held is UNCHANGED', () => {
        const bucketArrayMembershipUnique = new OIMBucketArrayMembershipUnique<TCardSlot>();
        const { db, slots } = named();
        const bucketSlotsArrayUniqueStore = bucketArrayMembershipUnique.createStore();
        bucketArrayMembershipUnique.addSlot(bucketSlotsArrayUniqueStore, slots.a);
        bucketSlotsArrayUniqueStore.bucketMemberSlots.push(slots.a);

        expect(bucketArrayMembershipUnique.containsTheSameSequence(bucketSlotsArrayUniqueStore, [slots.a, slots.a])).toBe(true);
        expect(setReconcileFindsNothing(db, [slots.a], [slots.a, slots.a])).toBe(true);
    });

    it('while a repeat that hides a slot the caller never named is still CHANGED', () => {
        const bucketArrayMembershipUnique = new OIMBucketArrayMembershipUnique<TCardSlot>();
        const { slots } = named();
        const bucketSlotsArrayUniqueStore = bucketArrayMembershipUnique.createStore();
        bucketArrayMembershipUnique.addSlot(bucketSlotsArrayUniqueStore, slots.a);
        bucketArrayMembershipUnique.addSlot(bucketSlotsArrayUniqueStore, slots.b);
        bucketSlotsArrayUniqueStore.bucketMemberSlots.push(slots.a, slots.b);

        // The defect the distinct run was written against, and the reason the
        // length guard alone can never be the answer.
        expect(bucketArrayMembershipUnique.containsTheSameSequence(bucketSlotsArrayUniqueStore, [slots.a, slots.a])).toBe(false);
    });
});

/* ── and what the wrong answer costs, through the collection ─────────────── */

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

describe('a poll that names one slot four times against a bucket holding it once', () => {
    it('tells nobody, because nothing a reader can see has changed', () => {
        const { db, membersService, decksService, decks, put, idsIn } = createFixture();
        const a = put('a', 10);
        const heldSlot = decksService.holdSlotByKey(decks, 'deck');
        membersService.writeBucketMemberSlots(heldSlot,[a]);
        db.flush();

        let runCount = 0;
        OIMEffectService.INSTANCE.createEffect(db, [heldSlot], [], () => { runCount++; });
        db.flush();
        const before = runCount;

        membersService.writeBucketMemberSlots(heldSlot,[a, a, a, a]);
        db.flush();

        expect(runCount).toBe(before);
        expect(idsIn(heldSlot)).toEqual(['a']);
        heldSlot.owner.unholdSlot(heldSlot);
    });
});

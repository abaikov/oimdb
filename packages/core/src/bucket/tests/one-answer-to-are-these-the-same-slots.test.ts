import { OIMDB, OIMEffectService, OIMSlotContentSetBucketService, OIMSlotContentPositionalArrayBucketService, OIMBucketUniqueMemberSlotsArrayService } from '../../index';
import type { TOIMBucketSlot } from '../types/TOIMBucketSlot';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMBucketSlotsArrayStore } from '../array/types/TOIMBucketSlotsArrayStore';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';
import { createOIMSlotContentEntityService } from '../../entity/createOIMSlotContentEntityService';

type Card = { id: string; rank: number };
type TCardSlot = TOIMEntitySlot<Card, string>;
type TDeck = TOIMBucketSlot<TOIMBucketSlotsArrayStore<TCardSlot>, string>;

class UniqueSequenceProbe extends OIMBucketUniqueMemberSlotsArrayService<TCardSlot> {
    public createStore(): TOIMBucketSlotsArrayStore<TCardSlot> {
        return this.createBucketSlotsArrayStore();
    }

    public holds(store: TOIMBucketSlotsArrayStore<TCardSlot>, slots: readonly TCardSlot[]): boolean {
        return this.isSameBucketMemberSlotSequence(store, slots);
    }
}

const heldStore = (probe: UniqueSequenceProbe, held: readonly TCardSlot[]): TOIMBucketSlotsArrayStore<TCardSlot> => {
    const store = probe.createStore();
    for (const slot of held) {
        store.uniqueBucketMemberSlots!.add(slot);
        store.bucketMemberSlots.push(slot);
    }
    return store;
};

const setReconcileFindsNothing = (db: OIMDB, held: readonly TCardSlot[], slots: readonly TCardSlot[]): boolean => {
    const membersService = new OIMSlotContentSetBucketService<TCardSlot, string>();
    const setsService = createOIMSlotCollectionService(db, { slotContentService: membersService });
    const bucket = setsService.holdSlotByKey(setsService.createStoreSlot(db), 'held');
    membersService.addBucketMemberSlots(bucket, held);
    return !membersService.writeSlotContent(bucket, slots);
};

const named = (): { db: OIMDB; slots: Record<string, TCardSlot> } => {
    const db = new OIMDB();
    const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<Card, string>(db) });
    const cards = cardsService.createStoreSlot(db);
    return {
        db,
        slots: {
            a: cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', rank: 1 }),
            b: cardsService.writeSlotContentByKey(cards, 'b', { id: 'b', rank: 2 }),
            c: cardsService.writeSlotContentByKey(cards, 'c', { id: 'c', rank: 3 }),
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
        const probe = new UniqueSequenceProbe();
        const disagreed: string[] = [];
        for (const { held, asks } of CASES) {
            const { db, slots } = named();
            const heldSlots = [...held].map(id => slots[id]);
            const list = [...asks].map(id => slots[id]);

            const bySet = setReconcileFindsNothing(db, heldSlots, list) && firstMentions(asks) === held;
            const byUnique = probe.holds(heldStore(probe, heldSlots), list);
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
        const probe = new UniqueSequenceProbe();
        const { db, slots } = named();

        expect(probe.holds(heldStore(probe, [slots.a]), [slots.a, slots.a])).toBe(true);
        expect(setReconcileFindsNothing(db, [slots.a], [slots.a, slots.a])).toBe(true);
    });

    it('while a repeat that hides a slot the caller never named is still CHANGED', () => {
        const probe = new UniqueSequenceProbe();
        const { slots } = named();

        // The defect the distinct run was written against, and the reason the
        // length guard alone can never be the answer.
        expect(probe.holds(heldStore(probe, [slots.a, slots.b]), [slots.a, slots.a])).toBe(false);
    });
});

/* ── and what the wrong answer costs, through the collection ─────────────── */

const createFixture =() => {
    const db = new OIMDB();
    const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<Card, string>(db) });
    const membersService = new OIMSlotContentPositionalArrayBucketService<TCardSlot, string>({ bucketMemberSlotsArrayService: new OIMBucketUniqueMemberSlotsArrayService() });
    const decksService = createOIMSlotCollectionService(db, { slotContentService: membersService });
    const cards = cardsService.createStoreSlot(db);
    const decks = decksService.createStoreSlot(db);
    const put = (id: string, rank: number): TCardSlot => cardsService.writeSlotContentByKey(cards, id, { id, rank });
    const idsIn = (bucket: TDeck): (string | undefined)[] =>
        [...membersService.getBucketMemberSlots(bucket)].map((slot) => slot.entity?.id);
    return { db, membersService, decksService, decks, put, idsIn };
};

describe('a poll that names one slot four times against a bucket holding it once', () => {
    it('tells nobody, because nothing a reader can see has changed', () => {
        const { db, membersService, decksService, decks, put, idsIn } = createFixture();
        const a = put('a', 10);
        const heldSlot = decksService.holdSlotByKey(decks, 'deck');
        membersService.writeSlotContent(heldSlot,[a]);
        db.flush();

        let runCount = 0;
        OIMEffectService.INSTANCE.createEffect(db, () => { runCount++; }, [heldSlot]);
        db.flush();
        const before = runCount;

        membersService.writeSlotContent(heldSlot,[a, a, a, a]);
        db.flush();

        expect(runCount).toBe(before);
        expect(idsIn(heldSlot)).toEqual(['a']);
        heldSlot.owner.unholdSlot(heldSlot);
    });
});

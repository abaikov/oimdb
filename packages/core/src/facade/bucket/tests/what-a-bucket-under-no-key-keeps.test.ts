import {
    OIMDB, OIMEffectService, OIMSlotContentBucketServiceArrayDriven, OIMSlotContentBucketServiceSetDriven,
    createOIMEntityService, createOIMSingleBucketService,
} from '../../../index';
import type { TOIMBucketSlotsArrayStore } from '../../../engine/bucket/array/types/TOIMBucketSlotsArrayStore';
import type { TOIMBucketSlotsSetStore } from '../../../engine/bucket/types/TOIMBucketSlotsSetStore';
import type { TOIMEntityColumnName } from '../../../engine/entity/types/TOIMEntityColumnName';
import type { TOIMEntitySlot } from '../../../engine/entity/types/TOIMEntitySlot';
import { oimIsSlotEmpty } from '../../../engine/slot/utils/oimIsSlotEmpty';
import { oimIsSlotReleased } from '../../../engine/slot/utils/oimIsSlotReleased';

type TCard = { id: string };
type TCardSlot = TOIMEntitySlot<TCard, string>;

const createFixture = () => {
    const db = new OIMDB();
    const effectService = OIMEffectService.INSTANCE;
    const cardsService = createOIMEntityService<TCard, TOIMEntityColumnName<TCard>, string>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    for (const id of ['a', 'b', 'c']) cardsService.slotContentService.upsertEntity(cards, { id });
    db.flush();
    const slot = (id: string): TCardSlot => cardsService.getSlotByKey(cards, id);
    return { db, effectService, slot };
};

const createSetDeckService = (db: OIMDB) => createOIMSingleBucketService<
    TCardSlot, TOIMBucketSlotsSetStore<TCardSlot>, OIMSlotContentBucketServiceSetDriven<TCardSlot>
>(db, { slotContentService: new OIMSlotContentBucketServiceSetDriven<TCardSlot>() });

const idsOf = (slots: Iterable<TCardSlot>): string[] => Array.from(slots, cardSlot => cardSlot.key);

describe('a set-driven bucket under no key', () => {
    it('holds what it is given, gives back what leaves, and wakes its subscriber once per write', () => {
        const { db, effectService, slot } = createFixture();
        const deckService = createSetDeckService(db);
        const deckContentService = deckService.slotContentService;
        const deck = deckService.createStoreSlot(db);
        let woke = 0;
        effectService.createEffect(db, [deckService.getSingleSlot(deck)], [], () => { woke++; });
        db.flush();
        const born = woke;

        deckContentService.writeBucketMemberSlots(deckService.getSingleSlot(deck), [slot('a'), slot('b')]);
        db.flush();
        expect(idsOf(deckContentService.getBucketMemberSlots(deckService.getSingleSlot(deck)))).toEqual(['a', 'b']);
        expect(slot('a').holdCount).toBe(1);
        expect(woke).toBe(born + 1);

        deckContentService.removeBucketMemberSlots(deckService.getSingleSlot(deck), [slot('a')]);
        deckContentService.addBucketMemberSlots(deckService.getSingleSlot(deck), [slot('c')]);
        db.flush();
        expect(idsOf(deckContentService.getBucketMemberSlots(deckService.getSingleSlot(deck))).sort()).toEqual(['b', 'c']);
        expect(slot('a').holdCount).toBe(0);
        expect(woke).toBe(born + 2);
    });

    it('is released, emptied and unheld, and the next read through the service mints a fresh bucket', () => {
        const { db, effectService, slot } = createFixture();
        const deckService = createSetDeckService(db);
        const deckContentService = deckService.slotContentService;
        const deck = deckService.createStoreSlot(db);
        const deckSlot = deckService.getSingleSlot(deck);
        const effect = effectService.createEffect(db, [deckSlot], [], () => undefined);
        deckContentService.writeBucketMemberSlots(deckSlot, [slot('a')]);
        db.flush();
        expect(oimIsSlotReleased(deckSlot)).toBe(false);
        expect(deckService.getSingleSlot(deck)).toBe(deckSlot);
        deckContentService.clearBucketMemberSlots(deckSlot);
        effectService.disposeEffect(effect);
        db.flush();

        expect(oimIsSlotReleased(deckSlot)).toBe(true);
        const nextDeckSlot = deckService.getSingleSlot(deck);
        expect(nextDeckSlot).not.toBe(deckSlot);
        expect(oimIsSlotReleased(nextDeckSlot)).toBe(false);
        expect(oimIsSlotEmpty(nextDeckSlot)).toBe(true);
        expect(deckContentService.getBucketMemberSlotCount(nextDeckSlot)).toBe(0);
        deckContentService.writeBucketMemberSlots(nextDeckSlot, [slot('b')]);
        expect(idsOf(deckContentService.getBucketMemberSlots(nextDeckSlot))).toEqual(['b']);
    });
});

describe('an array-driven bucket under no key', () => {
    it('keeps the order its positional doors give it, and holds what they bring in', () => {
        const { db, slot } = createFixture();
        const deckService = createOIMSingleBucketService<
            TCardSlot, TOIMBucketSlotsArrayStore<TCardSlot>, OIMSlotContentBucketServiceArrayDriven<TCardSlot>
        >(db, { slotContentService: new OIMSlotContentBucketServiceArrayDriven<TCardSlot>() });
        const deckContentService = deckService.slotContentService;
        const deck = deckService.createStoreSlot(db);
        const deckSlot = deckService.getSingleSlot(deck);

        deckContentService.writeBucketMemberSlots(deckService.getSingleSlot(deck), [slot('a'), slot('b')]);
        deckContentService.insertBucketMemberSlotAt(deckService.getSingleSlot(deck), 1, slot('c'));
        expect(idsOf(deckContentService.getBucketMemberSlots(deckService.getSingleSlot(deck)))).toEqual(['a', 'c', 'b']);
        expect(slot('c').holdCount).toBe(1);

        deckContentService.moveBucketMemberSlotToPosition(deckService.getSingleSlot(deck), 0, 2);
        expect(idsOf(deckContentService.getBucketMemberSlots(deckService.getSingleSlot(deck)))).toEqual(['c', 'b', 'a']);
        expect(deckContentService.getBucketMemberSlotPosition(deckService.getSingleSlot(deck), slot('a'))).toBe(2);

        expect(deckContentService.removeBucketMemberSlotAt(deckService.getSingleSlot(deck), 0)?.key).toBe('c');
        expect(slot('c').holdCount).toBe(0);
        expect(idsOf(deckContentService.removeBucketMemberSlotRange(deckService.getSingleSlot(deck), 0, 2))).toEqual(['b', 'a']);
        expect(deckContentService.getBucketMemberSlotCount(deckService.getSingleSlot(deck))).toBe(0);
        expect(deckService.getSingleSlot(deck)).toBe(deckSlot);
        expect(oimIsSlotReleased(deckSlot)).toBe(false);
    });
});

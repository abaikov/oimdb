import type { OIMSlotContentBucketService } from '../OIMSlotContentBucketService';
import { OIMSlotContentBucketServiceArrayDriven } from '../OIMSlotContentBucketServiceArrayDriven';
import { OIMSlotContentBucketServiceSetDriven } from '../OIMSlotContentBucketServiceSetDriven';
import { OIMDB } from '../../../factories/OIMDB';
import { OIMEffectService } from '../../../engine/computed/OIMEffectService';
import { createOIMBucketService } from '../../../factories/createOIMBucketService';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import type { TOIMEntitySlot } from '../../../engine/entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../../engine/store/types/TOIMStoreKey';

type TCard = { id: string; rank: number };
type TCardSlot = TOIMEntitySlot<TCard, TOIMStoreKey>;

const PAGE = 1000;

const openDeck = <TSlots>(membersService: OIMSlotContentBucketService<TCardSlot, TSlots>) => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: (card: TCard) => card.id });
    const cards = cardsService.createStoreSlot(db);
    const deckService = createOIMBucketService<
        TCardSlot, TOIMStoreKey, TSlots, OIMSlotContentBucketService<TCardSlot, TSlots>
    >(db, { slotContentService: membersService });
    const deck = deckService.createStoreSlot(db);
    const slots: TCardSlot[] = [];
    for (let i = 0; i <= PAGE; i++) slots.push(cardsService.slotContentService.upsertEntity(cards, { id: `c${i}`, rank: i }));
    const bucket = deckService.holdSlotByKey(deck, 'deck');
    membersService.writeBucketMemberSlots(bucket, slots.slice(0, PAGE));
    db.flush();
    let wakes = 0;
    OIMEffectService.INSTANCE.createEffect(db, [bucket], [], () => { wakes++; });
    return { db, membersService, bucket, slots, wakesSoFar: () => wakes };
};

const arrayDeck = () => new OIMSlotContentBucketServiceArrayDriven<TCardSlot>();

const setDeck = () => new OIMSlotContentBucketServiceSetDriven<TCardSlot>();

const holdCountsOf = (slots: readonly TCardSlot[]): number[] => slots.map(slot => slot.holdCount);

describe('what a whole-list write reconciles', () => {
    it('wakes nobody and moves no hold for an identical write to an array bucket', () => {
        const { db, membersService, bucket, slots, wakesSoFar } = openDeck(arrayDeck());
        const before = holdCountsOf(slots);

        membersService.writeBucketMemberSlots(bucket, slots.slice(0, PAGE));
        db.flush();

        expect(wakesSoFar()).toBe(0);
        expect(holdCountsOf(slots)).toEqual(before);
    });

    it('moves only the difference through a set bucket, and leaves every untouched entity slot its hold', () => {
        const { db, membersService, bucket, slots, wakesSoFar } = openDeck(setDeck());
        const before = holdCountsOf(slots.slice(1, PAGE));
        const hold = jest.spyOn(slots[0].owner, 'holdSlot');

        try {
            membersService.writeBucketMemberSlots(bucket, [...slots.slice(1, PAGE), slots[PAGE]]);
            expect(hold.mock.calls.length).toBe(1);
        } finally {
            hold.mockRestore();
        }
        db.flush();

        expect(wakesSoFar()).toBe(1);
        expect(holdCountsOf(slots.slice(1, PAGE))).toEqual(before);
        expect(membersService.getBucketMemberSlotCount(bucket)).toBe(PAGE);
        expect(slots[0].holdCount).toBe(0);
        expect(slots[PAGE].holdCount).toBe(1);
    });

    it('wakes nobody for an identical write to a set bucket', () => {
        const { db, membersService, bucket, slots, wakesSoFar } = openDeck(setDeck());

        membersService.writeBucketMemberSlots(bucket, [...slots.slice(0, PAGE)].reverse());
        db.flush();

        expect(wakesSoFar()).toBe(0);
    });
});

import {
    OIMDB, OIMSlotContentBucketServiceSetDriven, createOIMBucketService, createOIMEntityService,
} from '../../../index';
import type { TOIMBucketSlotsSetStore } from '../types/TOIMBucketSlotsSetStore';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import { oimIsSlotReleased } from '../../slot/utils/oimIsSlotReleased';

type Card = { id: string; title: string };
type TCardSlot = TOIMEntitySlot<Card, string>;

const createFixture =() => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService(db, { keyOf: (card: Card) => card.id });
    const cards = cardsService.createStoreSlot(db);
    const membersService = new OIMSlotContentBucketServiceSetDriven<TCardSlot>();
    const byDeckService = createOIMBucketService<
        TCardSlot, string, TOIMBucketSlotsSetStore<TCardSlot>, OIMSlotContentBucketServiceSetDriven<TCardSlot>
    >(db, { slotContentService: membersService });
    const byDeck = byDeckService.createStoreSlot(db);
    const card = (id: string): TCardSlot => cardsService.slotContentService.upsertEntity(cards, { id, title: id.toUpperCase() });
    return { cardsService, cards, membersService, byDeckService, byDeck, card };
};

// The hold must outlive the `write` that files the slot: a reserved slot has
// no entity, so `OIMSlotOwner.unhold` on its own line would release it.
const reserve = (
    cardsService: ReturnType<typeof createFixture>['cardsService'], cards: ReturnType<typeof createFixture>['cards'], id: string,
): TCardSlot => cardsService.holdSlotByKey(cards, id);

describe('a whole-bucket write by hand never lets a slot reach zero', () => {
    it('keeps a reserved identity filed when a changed list still names it', () => {
        const { cardsService, cards, membersService, byDeckService, byDeck, card } = createFixture();
        const held = reserve(cardsService, cards, 'r');
        const bucket = byDeckService.holdSlotByKey(byDeck, 'page-1');

        membersService.writeBucketMemberSlots(bucket,[held]);
        // AND ONLY NOW. From this line its place in the bucket is the whole of
        // what holds it: no value, no listener.
        held.owner.unholdSlot(held);
        expect(held.holdCount).toBe(1);
        expect(cardsService.getSlotByKey(cards, 'r')).toBe(held);

        // The same page re-sent with one row added. `r` LEAVES AND ARRIVES in
        // this one call, so its references must never touch zero.
        const arrived = card('a');
        membersService.writeBucketMemberSlots(bucket,[held, arrived]);

        expect(cardsService.getSlotByKey(cards, 'r')).toBe(held);
        expect(held.holdCount).toBe(1);
    });

    it('gives the identity back once the list stops naming it', () => {
        const { cardsService, cards, membersService, byDeckService, byDeck, card } = createFixture();
        const held = reserve(cardsService, cards, 'r');
        const bucket = byDeckService.holdSlotByKey(byDeck, 'page-1');

        membersService.writeBucketMemberSlots(bucket,[held]);
        // The bucket has it, so this give-back leaves it filed — which is
        // what makes the assertions below about the SECOND write.
        held.owner.unholdSlot(held);
        membersService.writeBucketMemberSlots(bucket,[card('a')]);

        // Nothing holds a valueless slot no list names, so it goes — this is the
        // release the order above must not make EARLY, not one it must not make.
        expect(oimIsSlotReleased(held)).toBe(true);
        expect(held.holdCount).toBe(0);
    });
});

describe('a list that names a slot twice buys one place and pays for one', () => {
    it('takes one hold for one place, whatever the list says', () => {
        const { membersService, byDeckService, byDeck, card } = createFixture();
        const a = card('a');
        const bucket = byDeckService.holdSlotByKey(byDeck, 'page-1');

        // An unordered service holds a SET, so the second mention records
        // nothing — and a hold taken for a place that was not recorded is
        // never handed back, because the departure hands back one per place.
        membersService.writeBucketMemberSlots(bucket,[a, a]);

        expect(membersService.getBucketMemberSlotCount(bucket)).toBe(1);
        expect(a.holdCount).toBe(1);
    });

    it('comes home to nothing once the bucket is emptied', () => {
        const { membersService, byDeckService, byDeck, card } = createFixture();
        const a = card('a');
        const bucket = byDeckService.holdSlotByKey(byDeck, 'page-1');

        membersService.writeBucketMemberSlots(bucket,[a, a]);
        membersService.clearBucketMemberSlots(bucket);

        expect(a.holdCount).toBe(0);
    });
});

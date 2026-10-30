import { OIMDB, OIMSlotContentSetBucketService } from '../../index';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import { oimIsSlotReleased } from '../../slot/utils/oimIsSlotReleased';
import { createOIMSlotContentEntityService } from '../../entity/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';

type Card = { id: string; title: string };
type TCardSlot = TOIMEntitySlot<Card, string>;

const createFixture =() => {
    const db = new OIMDB();
    const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<Card, string>(db) });
    const cards = cardsService.createStoreSlot(db);
    const membersService = new OIMSlotContentSetBucketService<TCardSlot>();
    const byDeckService = createOIMSlotCollectionService(db, { slotContentService: membersService });
    const byDeck = byDeckService.createStoreSlot(db);
    const card = (id: string): TCardSlot => cardsService.writeSlotContentByKey(cards, id, { id, title: id.toUpperCase() });
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

        membersService.writeSlotContent(bucket,[held]);
        // AND ONLY NOW. From this line its place in the bucket is the whole of
        // what holds it: no value, no listener.
        held.owner.unholdSlot(held);
        expect(held.holdCount).toBe(1);
        expect(cardsService.getSlotByKey(cards, 'r')).toBe(held);

        // The same page re-sent with one row added. `r` LEAVES AND ARRIVES in
        // this one call, so its references must never touch zero.
        const arrived = card('a');
        membersService.writeSlotContent(bucket,[held, arrived]);

        expect(cardsService.getSlotByKey(cards, 'r')).toBe(held);
        expect(held.holdCount).toBe(1);
    });

    it('gives the identity back once the list stops naming it', () => {
        const { cardsService, cards, membersService, byDeckService, byDeck, card } = createFixture();
        const held = reserve(cardsService, cards, 'r');
        const bucket = byDeckService.holdSlotByKey(byDeck, 'page-1');

        membersService.writeSlotContent(bucket,[held]);
        // The bucket has it, so this give-back leaves it filed — which is
        // what makes the assertions below about the SECOND write.
        held.owner.unholdSlot(held);
        membersService.writeSlotContent(bucket,[card('a')]);

        // Nothing holds a valueless slot no list names, so it goes — this is the
        // release the order above must not make EARLY, not one it must not make.
        expect(oimIsSlotReleased(held)).toBe(true);
        expect(held.holdCount).toBe(0);
    });
});

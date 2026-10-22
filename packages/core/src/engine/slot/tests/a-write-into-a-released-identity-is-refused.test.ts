import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMBucketService } from '../../../factories/createOIMBucketService';
import { OIMSlotContentBucketServiceSetDriven } from '../../../facade/bucket/OIMSlotContentBucketServiceSetDriven';
import { oimIsSlotReleased } from '../utils/oimIsSlotReleased';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMBucketSlotsSetStore } from '../../bucket/types/TOIMBucketSlotsSetStore';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';

type TCard = { id: string; title: string };
type TCardSlot = TOIMEntitySlot<TCard, TOIMStoreKey>;

const releasedCard = () => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: (card: TCard) => card.id });
    const cards = cardsService.createStoreSlot(db);
    const byDeckService = createOIMBucketService<
        TCardSlot, string, TOIMBucketSlotsSetStore<TCardSlot>, OIMSlotContentBucketServiceSetDriven<TCardSlot>
    >(db, { slotContentService: new OIMSlotContentBucketServiceSetDriven<TCardSlot>() });
    const byDeck = byDeckService.createStoreSlot(db);
    const card = cardsService.slotContentService.upsertEntity(cards, { id: 'c1', title: 'one' });
    db.flush();
    cardsService.slotContentService.deleteEntity(card);
    expect(oimIsSlotReleased(card)).toBe(true);
    expect(cardsService.getSlotCount(cards)).toBe(0);
    return { db, cards, cardsService, byDeck, byDeckService, card };
};

describe('a write into an identity the engine has already released', () => {
    it('is refused, and leaves nothing of that identity in the collection', () => {
        const { cards, cardsService, card } = releasedCard();

        expect(() => cardsService.slotContentService.writeEntity(card, { id: 'c1', title: 'two' })).toThrow(/This identity was released/);

        expect(Array.from(cardsService.getSlots(cards))).not.toContain(card);
        expect(cardsService.getSlotCount(cards)).toBe(0);
        expect(card.entity).toBeUndefined();
    });

    it('is refused on the patch door too, which mutates before it reports', () => {
        const { cards, cardsService, card } = releasedCard();

        expect(() => cardsService.slotContentService.updateEntity(card, { title: 'two' })).toThrow(/This identity was released/);

        expect(cardsService.getSlotCount(cards)).toBe(0);
    });

    it('is not how a write by key can end, because the key resolves to a fresh identity', () => {
        const { cards, cardsService, card } = releasedCard();

        const fresh = cardsService.slotContentService.insertEntity(cards, 'c1', { id: 'c1', title: 'two' });

        expect(fresh).not.toBe(card);
        expect(cardsService.getSlotByKey(cards, 'c1')).toBe(fresh);
        expect(Array.from(cardsService.getSlots(cards))).not.toContain(card);
        expect(cardsService.getSlotCount(cards)).toBe(1);
    });

    it('is refused for a bucket as much as for an entity, so no slot is held by one', () => {
        const { cards, cardsService, byDeck, byDeckService } = releasedCard();
        const card = cardsService.slotContentService.insertEntity(cards, 'c2', { id: 'c2', title: 'two' });
        const deck = byDeckService.holdSlotByKey(byDeck, 'd1');
        deck.owner.unholdSlot(deck);
        expect(oimIsSlotReleased(deck)).toBe(true);

        expect(() => byDeckService.slotContentService.writeBucketMemberSlots(deck, [card])).toThrow(/This identity was released/);

        expect(card.holdCount).toBe(0);
        expect(byDeckService.getSlotCount(byDeck)).toBe(0);
    });
});

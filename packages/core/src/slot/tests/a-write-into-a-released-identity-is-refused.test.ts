import { OIMDB } from '../../db/OIMDB';
import { OIMSlotContentSetBucketService } from '../../bucket/OIMSlotContentSetBucketService';
import { oimIsSlotReleased } from '../utils/oimIsSlotReleased';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';
import { createOIMSlotContentEntityService } from '../../entity/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../createOIMSlotCollectionService';

type TCard = { id: string; title: string };
type TCardSlot = TOIMEntitySlot<TCard, TOIMStoreKey>;

const releasedCard = () => {
    const db = new OIMDB();
    const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMSlotContentEntityService<TCard>() });
    const cards = cardsService.createStoreSlot(db);
    const byDeckService = createOIMSlotCollectionService({ slotContentService: new OIMSlotContentSetBucketService<TCardSlot>() });
    const byDeck = byDeckService.createStoreSlot(db);
    const card = cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'one' });
    db.flush();
    cardsService.slotContentService.clearSlotContent(card);
    expect(oimIsSlotReleased(card)).toBe(true);
    expect(cardsService.getSlotCount(cards)).toBe(0);
    return { db, cards, cardsService, byDeck, byDeckService, card };
};

describe('a write into an identity the engine has already released', () => {
    it('is refused, and leaves nothing of that identity in the collection', () => {
        const { cards, cardsService, card } = releasedCard();

        expect(() => cardsService.slotContentService.writeSlotContent(card, { id: 'c1', title: 'two' })).toThrow(/This identity was released/);

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

        const fresh = cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'two' });

        expect(fresh).not.toBe(card);
        expect(cardsService.getSlotByKey(cards, 'c1')).toBe(fresh);
        expect(Array.from(cardsService.getSlots(cards))).not.toContain(card);
        expect(cardsService.getSlotCount(cards)).toBe(1);
    });

    it('is refused for a bucket as much as for an entity, so no slot is held by one', () => {
        const { cards, cardsService, byDeck, byDeckService } = releasedCard();
        const card = cardsService.writeSlotContentByKey(cards, 'c2', { id: 'c2', title: 'two' });
        const deck = byDeckService.holdSlotByKey(byDeck, 'd1');
        deck.owner.unholdSlot(deck);
        expect(oimIsSlotReleased(deck)).toBe(true);

        expect(() => byDeckService.slotContentService.writeSlotContent(deck, [card])).toThrow(/This identity was released/);

        expect(card.holdCount).toBe(0);
        expect(byDeckService.getSlotCount(byDeck)).toBe(0);
    });
});

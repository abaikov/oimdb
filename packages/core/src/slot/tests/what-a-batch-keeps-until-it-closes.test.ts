import { OIMDB } from '../../db/OIMDB';
import { createOIMSlotCollectionService } from '../createOIMSlotCollectionService';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionIndexService } from '../../index/createOIMSlotCollectionIndexService';
import { OIMSlotAtUnholdReleasePolicy } from '../../collector/OIMSlotAtUnholdReleasePolicy';

type TCard = { id: string; deck: string; title: string };

function setUp() {
    const db = new OIMDB();
    const cardsService = createOIMSlotCollectionService({
        slotContentService: createOIMEntityContentService<TCard>(),
        slotReleasePolicy: OIMSlotAtUnholdReleasePolicy.INSTANCE,
    });
    const cards = cardsService.createStoreSlot(db);
    const byDeckService = createOIMSlotCollectionIndexService({ entityService: cardsService, columns: ['deck'] });
    const byDeck = byDeckService.createIndexStoreSlot(cards);
    const spades = byDeckService.holdSlotByKey(byDeck, 'spades');
    return { db, cardsService, cards, byDeckService, byDeck, spades };
}

describe('closing a batch', () => {
    it('is refused when no batch is open, so a later batch still holds its writes back', () => {
        const { cardsService, cards } = setUp();

        expect(() => cardsService.closeBatch(cards)).toThrow(/no batch is open/);
        cardsService.openBatch(cards);
        cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', deck: 'spades', title: 'Ace' });

        expect(cardsService.findSlotByKey(cards, 'c1')?.entity?.title).toBe('Ace');
        cardsService.closeBatch(cards);
    });
});

describe('a slot written inside a batch', () => {
    it('is not released before the index hears of it, even when another slot was queued after it', () => {
        const { cardsService, cards, byDeckService, byDeck } = setUp();

        cardsService.writeInBatch(cards, () => {
            const ace = cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', deck: 'spades', title: 'Ace' });
            cardsService.writeSlotContentByKey(cards, 'c2', { id: 'c2', deck: 'spades', title: 'King' });
            cardsService.slotContentService.updateEntityColumn(ace, 'title', 'Ace of spades');
        });

        expect(byDeckService.getEntitiesByKey(byDeck, 'spades').map(card => card?.title)).toEqual(['Ace of spades', 'King']);
        expect(cardsService.findSlotByKey(cards, 'c1')?.entity?.title).toBe('Ace of spades');
    });

    it('lands the same as the same writes outside a batch', () => {
        const { cardsService, cards, byDeckService, byDeck } = setUp();

        const ace = cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', deck: 'spades', title: 'Ace' });
        cardsService.writeSlotContentByKey(cards, 'c2', { id: 'c2', deck: 'spades', title: 'King' });
        cardsService.slotContentService.updateEntityColumn(ace, 'title', 'Ace of spades');

        expect(byDeckService.getEntitiesByKey(byDeck, 'spades').map(card => card?.title)).toEqual(['Ace of spades', 'King']);
    });
});

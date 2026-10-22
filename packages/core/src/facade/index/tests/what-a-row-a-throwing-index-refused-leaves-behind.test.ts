import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMIndexService } from '../../../factories/createOIMIndexService';
import { OIMSlotContentBucketServiceSetDriven } from '../../bucket/OIMSlotContentBucketServiceSetDriven';
import type { TOIMEntitySlot } from '../../../engine/entity/types/TOIMEntitySlot';

type TCard = { id: string; deck: string; title: string };
type TCardSlot = TOIMEntitySlot<TCard>;

function setUp() {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    const byDeckService = createOIMIndexService(db, {
        entityService: cardsService,
        keyOf: (card: TCard) => card.deck,
        slotContentService: new OIMSlotContentBucketServiceSetDriven<TCardSlot>(),
    });
    const byDeck = byDeckService.createIndexStoreSlot(cards);
    createOIMIndexService(db, {
        entityService: cardsService,
        keyOf: (card: TCard) => {
            if (card.title === 'bad') throw new Error('keyOf refused this row');
            return card.title;
        },
        slotContentService: new OIMSlotContentBucketServiceSetDriven<TCardSlot>(),
    }).createIndexStoreSlot(cards);
    const spades = byDeckService.holdSlotByKey(byDeck, 'spades');
    return { cardsService, cards, byDeckService, byDeck, spades };
}

describe('a new row that one index throws on', () => {
    it('is thrown at the write, and no index keeps it', () => {
        const { cardsService, cards, byDeckService, byDeck } = setUp();

        expect(() => cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deck: 'spades', title: 'bad' })).toThrow('keyOf refused this row');

        expect(cardsService.hasSlotContentByKey(cards, 'c1')).toBe(false);
        expect(byDeckService.getEntitiesByKey(byDeck, 'spades')).toEqual([]);
    });

    it('is filed once, by the next write that every index accepts', () => {
        const { cardsService, cards, byDeckService, byDeck } = setUp();
        expect(() => cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deck: 'spades', title: 'bad' })).toThrow();

        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deck: 'spades', title: 'good' });

        expect(byDeckService.getEntitiesByKey(byDeck, 'spades').map(card => card?.id)).toEqual(['c1']);
    });
});

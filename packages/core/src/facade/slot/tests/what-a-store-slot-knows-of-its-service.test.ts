import { OIMDB } from '../../../factories/OIMDB';
import { createOIMSlotCollectionService } from '../../../factories/createOIMSlotCollectionService';
import { createOIMSingleSlotService } from '../../../factories/createOIMSingleSlotService';
import { createOIMSlotContentEntityService } from '../../../factories/createOIMSlotContentEntityService';
import { createOIMSlotCollectionIndexService } from '../../../factories/createOIMSlotCollectionIndexService';

type TCard = { id: string; deck: string };
type TSettings = { theme: string };

describe('a store slot', () => {
    it('names the collection service that created it, so one constant reaches both', () => {
        const db = new OIMDB();
        const cards = createOIMSlotCollectionService(db, {
            slotContentService: createOIMSlotContentEntityService<TCard, string>(db),
        }).createStoreSlot(db);

        cards.slotService.writeSlotContentByKey(cards, 'c1', { id: 'c1', deck: 'spades' });

        expect(cards.slotService.getSlotByKey(cards, 'c1').entity?.deck).toBe('spades');
    });

    it('names the single slot service that created it', () => {
        const db = new OIMDB();
        const settings = createOIMSingleSlotService(db, {
            slotContentService: createOIMSlotContentEntityService<TSettings>(db),
        }).createStoreSlot(db);

        settings.slotService.writeSingleSlotContent(settings, { theme: 'dark' });

        expect(settings.slotService.getSingleSlot(settings).entity?.theme).toBe('dark');
    });

    it('of an index names the index service', () => {
        const db = new OIMDB();
        const cards = createOIMSlotCollectionService(db, {
            slotContentService: createOIMSlotContentEntityService<TCard, string>(db),
        }).createStoreSlot(db);
        const byDeck = createOIMSlotCollectionIndexService(db, {
            entityService: cards.slotService, keyOf: (card: TCard) => card.deck,
        }).createIndexStoreSlot(cards);
        cards.slotService.writeSlotContentByKey(cards, 'c1', { id: 'c1', deck: 'spades' });

        expect(byDeck.slotService.getEntitiesByKey(byDeck, 'spades').map(card => card?.id)).toEqual(['c1']);
    });
});

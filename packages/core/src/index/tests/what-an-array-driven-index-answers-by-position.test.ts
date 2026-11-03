import { OIMDB } from '../../db/OIMDB';
import { createOIMSlotCollectionIndexService } from '../createOIMSlotCollectionIndexService';
import type { TOIMColumnName } from '../../column/types/TOIMColumnName';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';
import type { OIMEntityContentService } from '../../entity/OIMEntityContentService';

type TCard = { id: string; deck: string };
type TCardsService = ReturnType<typeof createOIMSlotCollectionService<OIMEntityContentService<TCard>>>;

const createByDeckService = (cardsService: TCardsService) => createOIMSlotCollectionIndexService<
    TCard, TOIMStoreKey, readonly TOIMColumnName<TCard>[], string,
    Map<TOIMStoreKey, TOIMEntitySlot<TCard, TOIMStoreKey>>
>({ entityService: cardsService, keyOf: (card: TCard) => card.deck });

describe('an array-driven index', () => {
    it('answers a member by its arrival position and a position by its member', () => {
        const db = new OIMDB();
        const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard>() });
        const cards = cardsService.createStoreSlot(db);
        const byDeckService = createByDeckService(cardsService);
        const byDeck = byDeckService.createIndexStoreSlot(cards);
        const spades = byDeckService.holdSlotByKey(byDeck, 'spades');
        const ace = cardsService.writeSlotContentByKey(cards, 'ace', { id: 'ace', deck: 'spades' });
        const two = cardsService.writeSlotContentByKey(cards, 'two', { id: 'two', deck: 'spades' });
        const heart = cardsService.writeSlotContentByKey(cards, 'heart', { id: 'heart', deck: 'hearts' });

        expect(byDeckService.slotContentService.getBucketMemberSlotAt(spades, 0)).toBe(ace);
        expect(byDeckService.slotContentService.getBucketMemberSlotAt(spades, 1)).toBe(two);
        expect(byDeckService.slotContentService.getBucketMemberSlotAt(spades, 2)).toBeUndefined();
        expect(byDeckService.slotContentService.getBucketMemberSlotPosition(spades, two)).toBe(1);
        expect(byDeckService.slotContentService.getBucketMemberSlotPosition(spades, heart)).toBe(-1);
    });

    it('answers undefined for a position and -1 for a member once disposed, because dispose emptied its buckets', () => {
        const db = new OIMDB();
        const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard>() });
        const cards = cardsService.createStoreSlot(db);
        const byDeckService = createByDeckService(cardsService);
        const byDeck = byDeckService.createIndexStoreSlot(cards);
        const spades = byDeckService.holdSlotByKey(byDeck, 'spades');
        byDeckService.disposeIndexStoreSlot(byDeck);

        expect(byDeckService.slotContentService.getBucketMemberSlotAt(spades, 0)).toBeUndefined();
        expect(byDeckService.slotContentService.getBucketMemberSlotPosition(spades, cardsService.getSlotByKey(cards, 'ace'))).toBe(-1);
    });
});

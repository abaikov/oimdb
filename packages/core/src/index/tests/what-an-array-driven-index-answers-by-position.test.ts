import { OIMDB } from '../../db/OIMDB';
import { createOIMSlotCollectionIndexService } from '../createOIMSlotCollectionIndexService';
import type { TOIMEntityColumnName } from '../../entity/types/TOIMEntityColumnName';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';
import { createOIMSlotContentEntityService } from '../../entity/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';
import type { OIMSlotContentEntityService } from '../../entity/OIMSlotContentEntityService';

type TCard = { id: string; deck: string };
type TCardsService = ReturnType<typeof createOIMSlotCollectionService<OIMSlotContentEntityService<TCard>>>;

const createByDeckService = (cardsService: TCardsService) => createOIMSlotCollectionIndexService<
    TCard, TOIMStoreKey, readonly TOIMEntityColumnName<TCard>[], string,
    Map<TOIMStoreKey, TOIMEntitySlot<TCard, TOIMStoreKey>>
>({ entityService: cardsService, keyOf: (card: TCard) => card.deck });

describe('an array-driven index', () => {
    it('answers a member by its arrival position and a position by its member', () => {
        const db = new OIMDB();
        const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMSlotContentEntityService<TCard>() });
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
        const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMSlotContentEntityService<TCard>() });
        const cards = cardsService.createStoreSlot(db);
        const byDeckService = createByDeckService(cardsService);
        const byDeck = byDeckService.createIndexStoreSlot(cards);
        const spades = byDeckService.holdSlotByKey(byDeck, 'spades');
        byDeckService.disposeIndexStoreSlot(byDeck);

        expect(byDeckService.slotContentService.getBucketMemberSlotAt(spades, 0)).toBeUndefined();
        expect(byDeckService.slotContentService.getBucketMemberSlotPosition(spades, cardsService.getSlotByKey(cards, 'ace'))).toBe(-1);
    });
});

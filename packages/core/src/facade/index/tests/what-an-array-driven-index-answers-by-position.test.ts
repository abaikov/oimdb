import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMIndexService } from '../../../factories/createOIMIndexService';
import type { TOIMEntityColumnName } from '../../../engine/entity/types/TOIMEntityColumnName';
import type { TOIMEntitySlot } from '../../../engine/entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../../engine/store/types/TOIMStoreKey';

type TCard = { id: string; deck: string };
type TCardsService = ReturnType<typeof createOIMEntityService<TCard>>;

const createByDeckService = (db: OIMDB, cardsService: TCardsService) => createOIMIndexService<
    TCard, TOIMStoreKey, readonly TOIMEntityColumnName<TCard>[], string,
    Map<TOIMStoreKey, TOIMEntitySlot<TCard, TOIMStoreKey>>
>(db, { entityService: cardsService, keyOf: (card: TCard) => card.deck });

describe('an array-driven index', () => {
    it('answers a member by its arrival position and a position by its member', () => {
        const db = new OIMDB();
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        const byDeckService = createByDeckService(db, cardsService);
        const byDeck = byDeckService.createIndexStoreSlot(cards);
        const spades = byDeckService.holdSlotByKey(byDeck, 'spades');
        const ace = cardsService.slotContentService.upsertEntity(cards, { id: 'ace', deck: 'spades' });
        const two = cardsService.slotContentService.upsertEntity(cards, { id: 'two', deck: 'spades' });
        const heart = cardsService.slotContentService.upsertEntity(cards, { id: 'heart', deck: 'hearts' });

        expect(byDeckService.slotContentService.getBucketMemberSlotAt(spades, 0)).toBe(ace);
        expect(byDeckService.slotContentService.getBucketMemberSlotAt(spades, 1)).toBe(two);
        expect(byDeckService.slotContentService.getBucketMemberSlotAt(spades, 2)).toBeUndefined();
        expect(byDeckService.slotContentService.getBucketMemberSlotPosition(spades, two)).toBe(1);
        expect(byDeckService.slotContentService.getBucketMemberSlotPosition(spades, heart)).toBe(-1);
    });

    it('answers undefined for a position and -1 for a member once disposed, because dispose emptied its buckets', () => {
        const db = new OIMDB();
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        const byDeckService = createByDeckService(db, cardsService);
        const byDeck = byDeckService.createIndexStoreSlot(cards);
        const spades = byDeckService.holdSlotByKey(byDeck, 'spades');
        byDeckService.disposeIndexStoreSlot(byDeck);

        expect(byDeckService.slotContentService.getBucketMemberSlotAt(spades, 0)).toBeUndefined();
        expect(byDeckService.slotContentService.getBucketMemberSlotPosition(spades, cardsService.getSlotByKey(cards, 'ace'))).toBe(-1);
    });
});

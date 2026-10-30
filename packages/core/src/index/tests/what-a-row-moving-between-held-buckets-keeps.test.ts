import { OIMDB, OIMSlotContentSetBucketService, OIMSlotAtUnholdReleasePolicy, createOIMSlotCollectionIndexService } from '../../index';
import type { TOIMBucketSlotsSetStore } from '../../bucket/types/TOIMBucketSlotsSetStore';
import type { TOIMEntityColumnName } from '../../entity/types/TOIMEntityColumnName';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';
import { createOIMSlotContentEntityService } from '../../entity/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';

type TCard = { id: string; deck: string };
type TCardSlot = TOIMEntitySlot<TCard>;

const createFixture = () => {
    const db = new OIMDB({ slotReleasePolicy: new OIMSlotAtUnholdReleasePolicy() });
    const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard>(db) });
    const cards = cardsService.createStoreSlot(db);
    const byDeckService = createOIMSlotCollectionIndexService<
        TCard, TOIMStoreKey, readonly TOIMEntityColumnName<TCard>[], string,
        Map<TOIMStoreKey, TOIMEntitySlot<TCard, TOIMStoreKey>>, TOIMBucketSlotsSetStore<TCardSlot>,
        OIMSlotContentSetBucketService<TCardSlot, string>
    >(db, {
        entityService: cardsService,
        slotContentService: new OIMSlotContentSetBucketService<TCardSlot, string>(),
        keyOf: (card: TCard) => card.deck,
    });
    const byDeck = byDeckService.createIndexStoreSlot(cards);
    byDeckService.holdSlotByKey(byDeck, 'spades');
    byDeckService.holdSlotByKey(byDeck, 'clubs');
    return { cardsService, cards, byDeckService, byDeck };
};

describe('what a row moving between two held buckets keeps', () => {
    it('keeps the row and files it under the new key, even when the last unhold would release it', () => {
        const { cardsService, cards, byDeckService, byDeck } = createFixture();
        cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', deck: 'spades' });

        cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', deck: 'clubs' });

        expect(cardsService.hasSlotContentByKey(cards, 'c1')).toBe(true);
        expect(byDeckService.getEntitiesByKey(byDeck, 'clubs').map(card => card?.id)).toEqual(['c1']);
        expect(byDeckService.getEntitiesByKey(byDeck, 'spades')).toEqual([]);
    });

    it('keeps every row of a batch that moves them all', () => {
        const { cardsService, cards, byDeckService, byDeck } = createFixture();
        cardsService.writeInBatch(cards, () => ([{ id: 'c1', deck: 'spades' }, { id: 'c2', deck: 'spades' }]).map(entity => cardsService.writeSlotContentByKey(cards, entity.id, entity)));

        cardsService.writeInBatch(cards, () => ([{ id: 'c1', deck: 'clubs' }, { id: 'c2', deck: 'clubs' }]).map(entity => cardsService.writeSlotContentByKey(cards, entity.id, entity)));

        expect(byDeckService.getEntitiesByKey(byDeck, 'clubs').map(card => card?.id).sort()).toEqual(['c1', 'c2']);
        expect(byDeckService.getEntitiesByKey(byDeck, 'spades')).toEqual([]);
    });
});

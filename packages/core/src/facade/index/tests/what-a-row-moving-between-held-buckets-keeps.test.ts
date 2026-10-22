import {
    OIMDB, OIMSlotContentBucketServiceSetDriven, OIMSlotReleasePolicyAtUnhold, createOIMEntityService, createOIMIndexService,
} from '../../../index';
import type { TOIMBucketSlotsSetStore } from '../../../engine/bucket/types/TOIMBucketSlotsSetStore';
import type { TOIMEntityColumnName } from '../../../engine/entity/types/TOIMEntityColumnName';
import type { TOIMEntitySlot } from '../../../engine/entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../../engine/store/types/TOIMStoreKey';

type TCard = { id: string; deck: string };
type TCardSlot = TOIMEntitySlot<TCard>;

const createFixture = () => {
    const db = new OIMDB({ slotReleasePolicy: new OIMSlotReleasePolicyAtUnhold() });
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    const byDeckService = createOIMIndexService<
        TCard, TOIMStoreKey, readonly TOIMEntityColumnName<TCard>[], string,
        Map<TOIMStoreKey, TOIMEntitySlot<TCard, TOIMStoreKey>>, TOIMBucketSlotsSetStore<TCardSlot>,
        OIMSlotContentBucketServiceSetDriven<TCardSlot>
    >(db, {
        entityService: cardsService,
        slotContentService: new OIMSlotContentBucketServiceSetDriven<TCardSlot>(),
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
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deck: 'spades' });

        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deck: 'clubs' });

        expect(cardsService.hasSlotContentByKey(cards, 'c1')).toBe(true);
        expect(byDeckService.getEntitiesByKey(byDeck, 'clubs').map(card => card?.id)).toEqual(['c1']);
        expect(byDeckService.getEntitiesByKey(byDeck, 'spades')).toEqual([]);
    });

    it('keeps every row of a batch that moves them all', () => {
        const { cardsService, cards, byDeckService, byDeck } = createFixture();
        cardsService.slotContentService.upsertEntities(cards, [{ id: 'c1', deck: 'spades' }, { id: 'c2', deck: 'spades' }]);

        cardsService.slotContentService.upsertEntities(cards, [{ id: 'c1', deck: 'clubs' }, { id: 'c2', deck: 'clubs' }]);

        expect(byDeckService.getEntitiesByKey(byDeck, 'clubs').map(card => card?.id).sort()).toEqual(['c1', 'c2']);
        expect(byDeckService.getEntitiesByKey(byDeck, 'spades')).toEqual([]);
    });
});

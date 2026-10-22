import {
    OIMDB, OIMSlotContentBucketServiceSetDriven, OIMSlotReleasePolicyAtUnhold, createOIMEntityService, createOIMIndexService,
    oimIsSlotReleased,
} from '../../../index';
import type { TOIMBucketSlotsSetStore } from '../../../engine/bucket/types/TOIMBucketSlotsSetStore';
import type { TOIMEntityColumnName } from '../../../engine/entity/types/TOIMEntityColumnName';
import type { TOIMEntitySlot } from '../../../engine/entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../../engine/store/types/TOIMStoreKey';

type TCard = { id: string; deck: string };
type TCardSlot = TOIMEntitySlot<TCard>;
type TCardsService = ReturnType<typeof createOIMEntityService<TCard>>;

const createByDeckService = (db: OIMDB, cardsService: TCardsService) => createOIMIndexService<
    TCard, TOIMStoreKey, readonly TOIMEntityColumnName<TCard>[], string,
    Map<TOIMStoreKey, TOIMEntitySlot<TCard, TOIMStoreKey>>, TOIMBucketSlotsSetStore<TCardSlot>,
    OIMSlotContentBucketServiceSetDriven<TCardSlot>
>(db, {
    entityService: cardsService,
    slotContentService: new OIMSlotContentBucketServiceSetDriven<TCardSlot>(),
    keyOf: (card: TCard) => card.deck,
});

describe('a bucket filled by a scan of the source after a hand mutation', () => {
    it('takes the row out of the bucket its old key named, so it is in one bucket, not two', () => {
        const db = new OIMDB();
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        const byDeckService = createByDeckService(db, cardsService);
        const byDeck = byDeckService.createIndexStoreSlot(cards);
        byDeckService.holdSlotByKey(byDeck, 'spades');
        const card = cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deck: 'spades' });
        (card.entity as TCard).deck = 'clubs';

        byDeckService.holdSlotByKey(byDeck, 'clubs');
        cardsService.slotContentService.markEntityChanged(card, ['deck']);

        expect(byDeckService.getEntitiesByKey(byDeck, 'spades')).toEqual([]);
        expect(byDeckService.getEntitiesByKey(byDeck, 'clubs').map(entity => entity?.id)).toEqual(['c1']);
    });

    it('keeps the row alive across the move even when its last hold is the one it leaves', () => {
        const db = new OIMDB({ slotReleasePolicy: new OIMSlotReleasePolicyAtUnhold() });
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        const byDeckService = createByDeckService(db, cardsService);
        const byDeck = byDeckService.createIndexStoreSlot(cards);
        byDeckService.holdSlotByKey(byDeck, 'spades');
        const card = cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deck: 'spades' });
        (card.entity as TCard).deck = 'clubs';

        expect(() => byDeckService.holdSlotByKey(byDeck, 'clubs')).not.toThrow();
        db.flush();

        expect(oimIsSlotReleased(card)).toBe(false);
        expect(byDeckService.getEntitiesByKey(byDeck, 'clubs').map(entity => entity?.id)).toEqual(['c1']);
        expect(byDeckService.getEntitiesByKey(byDeck, 'spades')).toEqual([]);
    });
});

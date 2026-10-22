import {
    OIMDB, OIMEffectService, OIMSlotContentBucketServiceSetDriven, createOIMEntityService, createOIMIndexService,
} from '../../../index';
import type { TOIMEntitySlot } from '../../../index';

type TCard = { id: string; deck: string };

describe('a bucket minted inside a frame after a hand mutation', () => {
    it('leaves the row in one bucket, and the announced change moves it', () => {
        const db = new OIMDB();
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        const byDeckService = createOIMIndexService(db, {
            entityService: cardsService,
            keyOf: (card: TCard) => card.deck,
            slotContentService: new OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TCard>>(),
        });
        const byDeck = byDeckService.createIndexStoreSlot(cards);
        byDeckService.holdSlotByKey(byDeck, 'spades');
        const card = cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deck: 'spades' });
        const trigger = cardsService.slotContentService.upsertEntity(cards, { id: 't', deck: 'none' });
        db.flush();
        (card.entity as TCard).deck = 'clubs';

        const clubsMemberCountsInsideTheFrame: number[] = [];
        OIMEffectService.INSTANCE.createEffect(db, [trigger], [], () => {
            const clubs = byDeckService.getSlotByKey(byDeck, 'clubs');
            clubsMemberCountsInsideTheFrame.push(byDeckService.slotContentService.getBucketMemberSlotCount(clubs));
        });
        cardsService.slotContentService.updateEntity(trigger, { deck: 'none again' });
        db.flush();

        expect(clubsMemberCountsInsideTheFrame).toEqual([0]);
        expect(byDeckService.getEntitiesByKey(byDeck, 'spades').map(entity => entity?.id)).toEqual(['c1']);

        byDeckService.holdSlotByKey(byDeck, 'clubs');
        cardsService.slotContentService.markEntityChanged(card, ['deck']);
        expect(byDeckService.getEntitiesByKey(byDeck, 'spades')).toEqual([]);
        expect(byDeckService.getEntitiesByKey(byDeck, 'clubs').map(entity => entity?.id)).toEqual(['c1']);
    });
});

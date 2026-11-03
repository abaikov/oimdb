import { OIMDB, OIMEffectService, OIMSetBucketContentService, createOIMSlotCollectionIndexService } from '../../index';
import type { TOIMEntitySlot } from '../../index';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';

type TCard = { id: string; deck: string };

describe('a bucket minted inside a frame after a hand mutation', () => {
    it('leaves the row in one bucket, and the announced change moves it', () => {
        const db = new OIMDB();
        const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard>() });
        const cards = cardsService.createStoreSlot(db);
        const byDeckService = createOIMSlotCollectionIndexService({
            entityService: cardsService,
            selectKey: (card: TCard) => card.deck,
            slotContentService: new OIMSetBucketContentService<TOIMEntitySlot<TCard>>(),
        });
        const byDeck = byDeckService.createIndexStoreSlot(cards);
        byDeckService.holdSlotByKey(byDeck, 'spades');
        const card = cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', deck: 'spades' });
        const trigger = cardsService.writeSlotContentByKey(cards, 't', { id: 't', deck: 'none' });
        db.flush();
        (card.entity as TCard).deck = 'clubs';

        const clubsMemberCountsInsideTheFrame: number[] = [];
        OIMEffectService.INSTANCE.createEffect(db, () => {
            const clubs = byDeckService.getSlotByKey(byDeck, 'clubs');
            clubsMemberCountsInsideTheFrame.push(byDeckService.slotContentService.getBucketMemberSlotCount(clubs));
        }, [trigger]);
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

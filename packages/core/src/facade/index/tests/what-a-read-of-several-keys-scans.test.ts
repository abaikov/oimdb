import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMIndexService } from '../../../factories/createOIMIndexService';
import { createOIMIndexServiceByCompositeKey } from '../../../factories/createOIMIndexServiceByCompositeKey';
import { OIMEffectService } from '../../../engine/computed/OIMEffectService';

type TCard = { id: string; deck: string; suit: string };

describe('what a read of several keys scans', () => {
    it('fills every composite bucket it mints from one pass over the source', () => {
        const db = new OIMDB();
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        cardsService.slotContentService.upsertEntities(cards, [
            { id: 'c1', deck: 'red', suit: 'hearts' },
            { id: 'c2', deck: 'red', suit: 'hearts' },
            { id: 'c3', deck: 'red', suit: 'spades' },
            { id: 'c4', deck: 'blue', suit: 'hearts' },
        ]);
        db.flush();
        const byDeckAndSuitService = createOIMIndexServiceByCompositeKey(db, {
            entityService: cardsService,
            columns: ['deck', 'suit'],
        });
        const byDeckAndSuit = byDeckAndSuitService.createIndexStoreSlot(cards);
        const getSlots = jest.spyOn(cardsService, 'getSlots');

        const [redHearts, redSpades, blueHearts, blueSpades] = byDeckAndSuitService.getSlotsByKeys(byDeckAndSuit, [
            ['red', 'hearts'], ['red', 'spades'], ['blue', 'hearts'], ['blue', 'spades'],
        ]);

        expect(getSlots).toHaveBeenCalledTimes(1);
        expect(byDeckAndSuitService.slotContentService.getBucketMemberSlotCount(redHearts)).toBe(2);
        expect(byDeckAndSuitService.slotContentService.getBucketMemberSlotCount(redSpades)).toBe(1);
        expect(byDeckAndSuitService.slotContentService.getBucketMemberSlotCount(blueHearts)).toBe(1);
        expect(byDeckAndSuitService.slotContentService.getBucketMemberSlotCount(blueSpades)).toBe(0);
    });

    it('inside a frame, after a hand mutation, fills the minted buckets and leaves the mutated entity where the index filed it', () => {
        const db = new OIMDB();
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        const byDeckService = createOIMIndexService(db, { entityService: cardsService, keyOf: (card: TCard) => card.deck });
        const byDeck = byDeckService.createIndexStoreSlot(cards);
        byDeckService.holdSlotByKey(byDeck, 'spades');
        const card = cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deck: 'spades', suit: 's' });
        cardsService.slotContentService.upsertEntity(cards, { id: 'h1', deck: 'hearts', suit: 'h' });
        const trigger = cardsService.slotContentService.upsertEntity(cards, { id: 't', deck: 'none', suit: 'n' });
        db.flush();
        (card.entity as TCard).deck = 'clubs';

        const memberCountsInsideTheFrame: number[][] = [];
        OIMEffectService.INSTANCE.createEffect(db, [trigger], [], () => {
            const [clubs, hearts] = byDeckService.getSlotsByKeys(byDeck, ['clubs', 'hearts']);
            memberCountsInsideTheFrame.push([
                byDeckService.slotContentService.getBucketMemberSlotCount(clubs),
                byDeckService.slotContentService.getBucketMemberSlotCount(hearts),
            ]);
        });
        cardsService.slotContentService.updateEntity(trigger, { deck: 'none again' });
        db.flush();

        expect(memberCountsInsideTheFrame).toEqual([[0, 1]]);
        expect(byDeckService.getEntitiesByKey(byDeck, 'spades').map(entity => entity?.id)).toEqual(['c1']);

        byDeckService.holdSlotByKey(byDeck, 'clubs');
        cardsService.slotContentService.markEntityChanged(card, ['deck']);
        expect(byDeckService.getEntitiesByKey(byDeck, 'spades')).toEqual([]);
        expect(byDeckService.getEntitiesByKey(byDeck, 'clubs').map(entity => entity?.id)).toEqual(['c1']);
    });
});

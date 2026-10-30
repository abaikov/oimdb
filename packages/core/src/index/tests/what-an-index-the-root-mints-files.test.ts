import { OIMDB } from '../../db/OIMDB';
import { OIMEffectService } from '../../effect/OIMEffectService';
import { OIMSlotContentSetBucketService } from '../../bucket/OIMSlotContentSetBucketService';
import { createOIMSlotCollectionIndexService } from '../createOIMSlotCollectionIndexService';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import { createOIMSlotContentEntityService } from '../../entity/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';

type TCard = { id: string; deck: string };

describe('an index the root mints with nothing but a source and a key', () => {
    it('files rows written before and after it by the key it is given', () => {
        const db = new OIMDB();
        const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard>(db) });
        const cards = cardsService.createStoreSlot(db);
        cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', deck: 'spades' });
        const byDeckService = createOIMSlotCollectionIndexService(db, {
            entityService: cardsService,
            keyOf: card => card.deck,
            slotContentService: new OIMSlotContentSetBucketService<TOIMEntitySlot<TCard>>(),
        });
        const byDeck = byDeckService.createIndexStoreSlot(cards);
        const spades = byDeckService.holdSlotByKey(byDeck, 'spades');

        cardsService.writeSlotContentByKey(cards, 'c2', { id: 'c2', deck: 'spades' });
        cardsService.writeSlotContentByKey(cards, 'c3', { id: 'c3', deck: 'hearts' });
        db.flush();

        expect(byDeckService.getEntitiesByKey(byDeck, 'spades').map(card => card?.id).sort()).toEqual(['c1', 'c2']);
        spades.owner.unholdSlot(spades);
    });

    it('wakes an effect on a held bucket through the root channel', () => {
        const db = new OIMDB();
        const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard>(db) });
        const cards = cardsService.createStoreSlot(db);
        const byDeckService = createOIMSlotCollectionIndexService(db, {
            entityService: cardsService,
            keyOf: card => card.deck,
            slotContentService: new OIMSlotContentSetBucketService<TOIMEntitySlot<TCard>>(),
        });
        const byDeck = byDeckService.createIndexStoreSlot(cards);
        const spades = byDeckService.holdSlotByKey(byDeck, 'spades');

        let runs = 0;
        OIMEffectService.INSTANCE.createEffect(db, () => { runs++; }, [spades]);
        cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', deck: 'spades' });
        db.flush();

        expect(runs).toBe(1);
        expect(byDeckService.slotContentService.getBucketMemberSlotCount(spades)).toBe(1);
        spades.owner.unholdSlot(spades);
    });
});

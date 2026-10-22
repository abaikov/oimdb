import { OIMDB } from '../OIMDB';
import { OIMEffectService } from '../../engine/computed/OIMEffectService';
import { OIMSlotContentBucketServiceSetDriven } from '../../facade/bucket/OIMSlotContentBucketServiceSetDriven';
import { createOIMEntityService } from '../createOIMEntityService';
import { createOIMIndexService } from '../createOIMIndexService';
import type { TOIMEntitySlot } from '../../engine/entity/types/TOIMEntitySlot';

type TCard = { id: string; deck: string };

describe('an index the root mints with nothing but a source and a key', () => {
    it('files rows written before and after it by the key it is given', () => {
        const db = new OIMDB();
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deck: 'spades' });
        const byDeckService = createOIMIndexService(db, {
            entityService: cardsService,
            keyOf: card => card.deck,
            slotContentService: new OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TCard>>(),
        });
        const byDeck = byDeckService.createIndexStoreSlot(cards);
        const spades = byDeckService.holdSlotByKey(byDeck, 'spades');

        cardsService.slotContentService.upsertEntity(cards, { id: 'c2', deck: 'spades' });
        cardsService.slotContentService.upsertEntity(cards, { id: 'c3', deck: 'hearts' });
        db.flush();

        expect(byDeckService.getEntitiesByKey(byDeck, 'spades').map(card => card?.id).sort()).toEqual(['c1', 'c2']);
        spades.owner.unholdSlot(spades);
    });

    it('wakes an effect on a held bucket through the root channel', () => {
        const db = new OIMDB();
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        const byDeckService = createOIMIndexService(db, {
            entityService: cardsService,
            keyOf: card => card.deck,
            slotContentService: new OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TCard>>(),
        });
        const byDeck = byDeckService.createIndexStoreSlot(cards);
        const spades = byDeckService.holdSlotByKey(byDeck, 'spades');

        let runs = 0;
        OIMEffectService.INSTANCE.createEffect(db, [spades], [], () => { runs++; });
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deck: 'spades' });
        db.flush();

        expect(runs).toBe(1);
        expect(byDeckService.slotContentService.getBucketMemberSlotCount(spades)).toBe(1);
        spades.owner.unholdSlot(spades);
    });
});

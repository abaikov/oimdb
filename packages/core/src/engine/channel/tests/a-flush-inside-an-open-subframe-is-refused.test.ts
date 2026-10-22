import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMIndexService } from '../../../factories/createOIMIndexService';
import { OIMSlotContentBucketServiceSetDriven } from '../../../facade/bucket/OIMSlotContentBucketServiceSetDriven';
import { OIMChannelService } from '../OIMChannelService';
import type { TOIMBucketSlotsSetStore } from '../../bucket/types/TOIMBucketSlotsSetStore';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';
import type { TOIMDefaultSlotStore } from '../../store/types/TOIMDefaultSlotStore';

type TCard = { id: string; deck: string };
type TCardSlot = TOIMEntitySlot<TCard>;

const REFUSAL = 'a subframe is open';

describe('a flush called while a subframe is open', () => {
    it('is refused when the caller opened the subframe itself', () => {
        const db = new OIMDB();
        OIMChannelService.INSTANCE.openSubframe(db.defaultChannelSlot);

        expect(() => { db.flush(); }).toThrow(REFUSAL);

        OIMChannelService.INSTANCE.closeSubframe(db.defaultChannelSlot);
        expect(() => { db.flush(); }).not.toThrow();
    });

    it('is refused from code a write runs, and the write stays whole', () => {
        const db = new OIMDB();
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        const byDeckService = createOIMIndexService<
            TCard, TOIMStoreKey, readonly ('id' | 'deck')[], string, TOIMDefaultSlotStore<TOIMStoreKey, TOIMEntitySlot<TCard, TOIMStoreKey>>,
            TOIMBucketSlotsSetStore<TCardSlot>, OIMSlotContentBucketServiceSetDriven<TCardSlot>
        >(db, {
            entityService: cardsService,
            slotContentService: new OIMSlotContentBucketServiceSetDriven<TCardSlot>(),
            keyOf: card => {
                if (card.deck === 'flush-me') db.flush();
                return card.deck;
            },
        });
        const byDeck = byDeckService.createIndexStoreSlot(cards);
        const spades = byDeckService.holdSlotByKey(byDeck, 'spades');

        expect(() => cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deck: 'flush-me' })).toThrow(REFUSAL);
        cardsService.slotContentService.upsertEntity(cards, { id: 'c2', deck: 'spades' });
        db.flush();

        expect(cardsService.hasSlotContentByKey(cards, 'c1')).toBe(false);
        expect(byDeckService.getEntitiesByKey(byDeck, 'spades').map(card => card?.id)).toEqual(['c2']);
        spades.owner.unholdSlot(spades);
    });
});

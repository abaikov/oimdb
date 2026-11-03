import { OIMDB, OIMSetBucketContentService, OIMSlotAtEmptyReleasePolicy, createOIMSlotCollectionIndexService, isOIMSlotReleased } from '../../index';
import type { TOIMEntitySlot } from '../../index';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../createOIMSlotCollectionService';

type TCard = { id: string; deck: string };

class OIMSlotReleasePolicyAtEmptyAsked extends OIMSlotAtEmptyReleasePolicy {
    public readonly asked: string[] = [];

    public override isSlotReleasable(): boolean {
        this.asked.push('non-empty');
        return false;
    }

    public override isEmptySlotReleasable(): boolean {
        this.asked.push('empty');
        return true;
    }
}

describe('what a listener sees of a cleared slot', () => {
    it('lets the release policy be asked only about an empty slot, once a clear has emptied it', () => {
        const slotReleasePolicy = new OIMSlotReleasePolicyAtEmptyAsked();
        const db = new OIMDB();
        const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard>(), slotReleasePolicy });
        const cards = cardsService.createStoreSlot(db);
        const byDeckService = createOIMSlotCollectionIndexService({
            entityService: cardsService,
            selectKey: (card: TCard) => card.deck,
            slotContentService: new OIMSetBucketContentService<TOIMEntitySlot<TCard>>(),
        });
        const byDeck = byDeckService.createIndexStoreSlot(cards);
        byDeckService.holdSlotByKey(byDeck, 'x');
        const card = cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', deck: 'x' });
        db.flush();
        slotReleasePolicy.asked.length = 0;

        cardsService.slotContentService.clearSlotContent(card);

        expect(slotReleasePolicy.asked).toEqual(['empty']);
        expect(isOIMSlotReleased(card)).toBe(true);
    });
});

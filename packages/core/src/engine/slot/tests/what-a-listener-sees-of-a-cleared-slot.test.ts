import {
    OIMDB, OIMSlotContentBucketServiceSetDriven, OIMSlotReleasePolicyAtEmpty, createOIMEntityService, createOIMIndexService,
    oimIsSlotReleased,
} from '../../../index';
import type { TOIMEntitySlot } from '../../../index';

type TCard = { id: string; deck: string };

class OIMSlotReleasePolicyAtEmptyAsked extends OIMSlotReleasePolicyAtEmpty {
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
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id, slotReleasePolicy });
        const cards = cardsService.createStoreSlot(db);
        const byDeckService = createOIMIndexService(db, {
            entityService: cardsService,
            keyOf: (card: TCard) => card.deck,
            slotContentService: new OIMSlotContentBucketServiceSetDriven<TOIMEntitySlot<TCard>>(),
        });
        const byDeck = byDeckService.createIndexStoreSlot(cards);
        byDeckService.holdSlotByKey(byDeck, 'x');
        const card = cardsService.slotContentService.upsertEntity(cards, { id: 'a', deck: 'x' });
        db.flush();
        slotReleasePolicy.asked.length = 0;

        cardsService.slotContentService.deleteEntity(card);

        expect(slotReleasePolicy.asked).toEqual(['empty']);
        expect(oimIsSlotReleased(card)).toBe(true);
    });
});

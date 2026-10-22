import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMIndexService } from '../../../factories/createOIMIndexService';
import { OIMSlotContentBucketServiceSetDriven } from '../../../facade/bucket/OIMSlotContentBucketServiceSetDriven';
import { OIMSlotReleasePolicyAtUnhold } from '../OIMSlotReleasePolicyAtUnhold';
import { oimIsSlotReleased } from '../../slot/utils/oimIsSlotReleased';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';

type TCard = { id: string; deck: string; title: string };
type TCardSlot = TOIMEntitySlot<TCard>;

function setUp() {
    const db = new OIMDB({ slotReleasePolicy: new OIMSlotReleasePolicyAtUnhold() });
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    const byDeckService = createOIMIndexService(db, {
        entityService: cardsService,
        keyOf: (card: TCard) => card.deck,
        slotContentService: new OIMSlotContentBucketServiceSetDriven<TCardSlot>(),
    });
    return { db, cards, cardsService, byDeckService };
}

describe('a write into a row nobody holds, under the at-unhold policy', () => {
    it('keeps nothing, on the first write of a key as on every later one', () => {
        const { cards, cardsService } = setUp();

        const first = cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deck: 'spades', title: 'one' });
        expect(oimIsSlotReleased(first)).toBe(true);
        expect(cardsService.hasSlotContentByKey(cards, 'c1')).toBe(false);

        const second = cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deck: 'spades', title: 'two' });
        expect(oimIsSlotReleased(second)).toBe(true);
        expect(cardsService.hasSlotContentByKey(cards, 'c1')).toBe(false);
    });

    it('keeps a row an index files into a held bucket, written alone', () => {
        const { cards, cardsService, byDeckService } = setUp();
        const byDeck = byDeckService.createIndexStoreSlot(cards);
        const spades = byDeckService.holdSlotByKey(byDeck, 'spades');

        const card = cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deck: 'spades', title: 'one' });

        expect(oimIsSlotReleased(card)).toBe(false);
        expect(byDeckService.getEntitiesByKey(byDeck, 'spades').map(entity => entity?.id)).toEqual(['c1']);
        spades.owner.unholdSlot(spades);
    });

    it('keeps a row an index files into a held bucket, written in a batch', () => {
        const { cards, cardsService, byDeckService } = setUp();
        const byDeck = byDeckService.createIndexStoreSlot(cards);
        const spades = byDeckService.holdSlotByKey(byDeck, 'spades');

        cardsService.slotContentService.upsertEntities(cards, [
            { id: 'c1', deck: 'spades', title: 'one' },
            { id: 'c2', deck: 'hearts', title: 'two' },
        ]);

        expect(cardsService.hasSlotContentByKey(cards, 'c1')).toBe(true);
        expect(cardsService.hasSlotContentByKey(cards, 'c2')).toBe(false);
        expect(byDeckService.getEntitiesByKey(byDeck, 'spades').map(entity => entity?.id)).toEqual(['c1']);
        spades.owner.unholdSlot(spades);
    });

    it('still keeps every row when no policy is named', () => {
        const db = new OIMDB();
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);

        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', deck: 'spades', title: 'one' });
        cardsService.slotContentService.upsertEntities(cards, [{ id: 'c2', deck: 'spades', title: 'two' }]);

        expect(cardsService.hasSlotContentByKey(cards, 'c1')).toBe(true);
        expect(cardsService.hasSlotContentByKey(cards, 'c2')).toBe(true);
    });
});

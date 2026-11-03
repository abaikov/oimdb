import { OIMDefaults } from '../../db/OIMDefaults';
import { OIMDB } from '../../db/OIMDB';
import { createOIMSlotCollectionIndexService } from '../../index/createOIMSlotCollectionIndexService';
import { OIMSetBucketContentService } from '../../bucket/OIMSetBucketContentService';
import { OIMSlotAtUnholdReleasePolicy } from '../OIMSlotAtUnholdReleasePolicy';
import { isOIMSlotReleased } from '../../slot/utils/isOIMSlotReleased';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';

type TCard = { id: string; deck: string; title: string };
type TCardSlot = TOIMEntitySlot<TCard>;

function setUp() {
    const defaults = new OIMDefaults({ slotReleasePolicy: new OIMSlotAtUnholdReleasePolicy() });
    const db = new OIMDB();
    const cardsService = createOIMSlotCollectionService({ defaults, slotContentService: createOIMEntityContentService<TCard>({ defaults }) });
    const cards = cardsService.createStoreSlot(db);
    const byDeckService = createOIMSlotCollectionIndexService({ defaults,
        entityService: cardsService,
        keyOf: (card: TCard) => card.deck,
        slotContentService: new OIMSetBucketContentService<TCardSlot>(),
    });
    return { db, cards, cardsService, byDeckService };
}

describe('a write into a row nobody holds, under the at-unhold policy', () => {
    it('keeps nothing, on the first write of a key as on every later one', () => {
        const { cards, cardsService } = setUp();

        const first = cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', deck: 'spades', title: 'one' });
        expect(isOIMSlotReleased(first)).toBe(true);
        expect(cardsService.hasSlotContentByKey(cards, 'c1')).toBe(false);

        const second = cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', deck: 'spades', title: 'two' });
        expect(isOIMSlotReleased(second)).toBe(true);
        expect(cardsService.hasSlotContentByKey(cards, 'c1')).toBe(false);
    });

    it('keeps a row an index files into a held bucket, written alone', () => {
        const { cards, cardsService, byDeckService } = setUp();
        const byDeck = byDeckService.createIndexStoreSlot(cards);
        const spades = byDeckService.holdSlotByKey(byDeck, 'spades');

        const card = cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', deck: 'spades', title: 'one' });

        expect(isOIMSlotReleased(card)).toBe(false);
        expect(byDeckService.getEntitiesByKey(byDeck, 'spades').map(entity => entity?.id)).toEqual(['c1']);
        spades.owner.unholdSlot(spades);
    });

    it('keeps a row an index files into a held bucket, written in a batch', () => {
        const { cards, cardsService, byDeckService } = setUp();
        const byDeck = byDeckService.createIndexStoreSlot(cards);
        const spades = byDeckService.holdSlotByKey(byDeck, 'spades');

        cardsService.writeInBatch(cards, () => ([
            { id: 'c1', deck: 'spades', title: 'one' },
            { id: 'c2', deck: 'hearts', title: 'two' },
        ]).map(entity => cardsService.writeSlotContentByKey(cards, entity.id, entity)));

        expect(cardsService.hasSlotContentByKey(cards, 'c1')).toBe(true);
        expect(cardsService.hasSlotContentByKey(cards, 'c2')).toBe(false);
        expect(byDeckService.getEntitiesByKey(byDeck, 'spades').map(entity => entity?.id)).toEqual(['c1']);
        spades.owner.unholdSlot(spades);
    });

    it('still keeps every row when no policy is named', () => {
        const db = new OIMDB();
        const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard>() });
        const cards = cardsService.createStoreSlot(db);

        cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', deck: 'spades', title: 'one' });
        cardsService.writeInBatch(cards, () => ([{ id: 'c2', deck: 'spades', title: 'two' }]).map(entity => cardsService.writeSlotContentByKey(cards, entity.id, entity)));

        expect(cardsService.hasSlotContentByKey(cards, 'c1')).toBe(true);
        expect(cardsService.hasSlotContentByKey(cards, 'c2')).toBe(true);
    });
});

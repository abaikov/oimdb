import { OIMDB } from '../../../factories/OIMDB';
import { createOIMSlotCollectionService } from '../../../factories/createOIMSlotCollectionService';
import { createOIMSlotContentEntityService } from '../../../factories/createOIMSlotContentEntityService';
import { createOIMSlotCollectionIndexService } from '../../../factories/createOIMSlotCollectionIndexService';
import { OIMSlotCollectionIndexService } from '../../index/OIMSlotCollectionIndexService';
import { OIMSlotContentPositionalArrayBucketService } from '../../bucket/OIMSlotContentPositionalArrayBucketService';
import type { TOIMEntitySlot } from '../../../engine/entity/types/TOIMEntitySlot';

type TCard = { id: string; deck: string; title: string };
type TCardSlot = TOIMEntitySlot<TCard>;

type TIndexDeliveries = {
    updateIndexKeyForSlot: (...args: unknown[]) => void;
    updateIndexKeysForSlots: (...args: unknown[]) => void;
};

function setUp(keyOf: (card: TCard) => string = card => card.deck) {
    const db = new OIMDB();
    const cardsService = createOIMSlotCollectionService(db, {
        slotContentService: createOIMSlotContentEntityService<TCard>(db),
    });
    const cards = cardsService.createStoreSlot(db);
    const bucketService = new OIMSlotContentPositionalArrayBucketService<TCardSlot, string>();
    const byDeckService = createOIMSlotCollectionIndexService(db, { entityService: cardsService, keyOf, slotContentService: bucketService });
    const byDeck = byDeckService.createIndexStoreSlot(cards);
    const spades = byDeckService.holdSlotByKey(byDeck, 'spades');
    const indexDeliveries = OIMSlotCollectionIndexService.prototype as unknown as TIndexDeliveries;
    const oneByOne = jest.spyOn(indexDeliveries, 'updateIndexKeyForSlot');
    const asOneBatch = jest.spyOn(indexDeliveries, 'updateIndexKeysForSlots');
    return { db, cardsService, cards, bucketService, byDeckService, byDeck, spades, oneByOne, asOneBatch };
}

function cardsOf(byDeckService: ReturnType<typeof setUp>['byDeckService'], byDeck: ReturnType<typeof setUp>['byDeck'], deck: string) {
    return byDeckService.getEntitiesByKey(byDeck, deck).map(card => card?.id);
}

afterEach(() => {
    jest.restoreAllMocks();
});

describe('a write outside a batch', () => {
    it('reaches the index at once, one slot at a time', () => {
        const { cardsService, cards, byDeckService, byDeck, oneByOne, asOneBatch } = setUp();

        cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', deck: 'spades', title: 'Ace' });

        expect(cardsOf(byDeckService, byDeck, 'spades')).toEqual(['c1']);
        expect(oneByOne).toHaveBeenCalledTimes(1);
        expect(asOneBatch).not.toHaveBeenCalled();
    });
});

describe('writes inside a batch', () => {
    it('reach the index once, as one batch, when the batch closes', () => {
        const { cardsService, cards, byDeckService, byDeck, oneByOne, asOneBatch } = setUp();

        cardsService.writeInBatch(cards, () => {
            cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', deck: 'spades', title: 'Ace' });
            cardsService.writeSlotContentByKey(cards, 'c2', { id: 'c2', deck: 'spades', title: 'King' });
            cardsService.writeSlotContentByKey(cards, 'c3', { id: 'c3', deck: 'hearts', title: 'Queen' });
            expect(cardsOf(byDeckService, byDeck, 'spades')).toEqual([]);
        });

        expect(cardsOf(byDeckService, byDeck, 'spades')).toEqual(['c1', 'c2']);
        expect(asOneBatch).toHaveBeenCalledTimes(1);
        expect(oneByOne).not.toHaveBeenCalled();
    });

    it('reach the index when the outermost of two nested batches closes', () => {
        const { cardsService, cards, byDeckService, byDeck, asOneBatch } = setUp();

        cardsService.openBatch(cards);
        cardsService.openBatch(cards);
        cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', deck: 'spades', title: 'Ace' });
        cardsService.writeSlotContentByKey(cards, 'c2', { id: 'c2', deck: 'spades', title: 'King' });
        cardsService.closeBatch(cards);
        expect(cardsOf(byDeckService, byDeck, 'spades')).toEqual([]);
        cardsService.closeBatch(cards);

        expect(cardsOf(byDeckService, byDeck, 'spades')).toEqual(['c1', 'c2']);
        expect(asOneBatch).toHaveBeenCalledTimes(1);
    });

    it('may be flushed in the middle, and the index catches up when the batch closes', () => {
        const { db, cardsService, cards, byDeckService, byDeck } = setUp();

        cardsService.writeInBatch(cards, () => {
            cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', deck: 'spades', title: 'Ace' });
            expect(() => db.flush()).not.toThrow();
        });

        expect(cardsOf(byDeckService, byDeck, 'spades')).toEqual(['c1']);
    });
});

describe('a write an index throws on', () => {
    it('stays written: the throw reaches the caller and nothing is rolled back', () => {
        const { cardsService, cards } = setUp(card => {
            if (card.title === 'bad') throw new Error('keyOf refused this card');
            return card.deck;
        });

        expect(() => cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', deck: 'spades', title: 'bad' }))
            .toThrow('keyOf refused this card');

        expect(cardsService.hasSlotContentByKey(cards, 'c1')).toBe(true);
    });
});

describe('reconciling a bucket with what the server sent', () => {
    it('hands back the members the server left out, and nothing else', () => {
        const { cardsService, cards, bucketService, spades } = setUp();
        const c1 = cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', deck: 'spades', title: 'Ace' });
        cardsService.writeSlotContentByKey(cards, 'c2', { id: 'c2', deck: 'spades', title: 'King' });
        const c3 = cardsService.writeSlotContentByKey(cards, 'c3', { id: 'c3', deck: 'spades', title: 'Queen' });

        const missingSlots = bucketService.getBucketMemberSlotsMissingFrom(spades, [c1, c3]);

        expect(missingSlots.map(cardSlot => cardSlot.key)).toEqual(['c2']);
    });

    it('lets a write in the same batch move what is missing out of the bucket, and keeps it in the store', () => {
        const { cardsService, cards, bucketService, byDeckService, byDeck, spades } = setUp();
        cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', deck: 'spades', title: 'Ace' });
        cardsService.writeSlotContentByKey(cards, 'c2', { id: 'c2', deck: 'spades', title: 'King' });
        const response: TCard[] = [{ id: 'c1', deck: 'spades', title: 'Ace of spades' }];

        cardsService.writeInBatch(cards, () => {
            const receivedSlots = response.map(card => cardsService.writeSlotContentByKey(cards, card.id, card));
            for (const missingSlot of bucketService.getBucketMemberSlotsMissingFrom(spades, receivedSlots)) {
                cardsService.slotContentService.updateEntity(missingSlot, { deck: '' });
            }
        });

        expect(cardsOf(byDeckService, byDeck, 'spades')).toEqual(['c1']);
        expect(cardsService.hasSlotContentByKey(cards, 'c2')).toBe(true);
    });
});

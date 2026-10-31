import { OIMDB } from '../../db/OIMDB';
import { OIMSlotContentSetBucketService } from '../../bucket/OIMSlotContentSetBucketService';
import type { TOIMEntitySlot } from '../types/TOIMEntitySlot';
import type { TOIMStoreKey } from '../../store/types/TOIMStoreKey';
import { createOIMSlotContentEntityService } from '../createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';

type TCard = { id: string; title: string };
type TCardSlot = TOIMEntitySlot<TCard, TOIMStoreKey>;

const createFixture = () => {
    const db = new OIMDB();
    const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMSlotContentEntityService<TCard, TOIMStoreKey>() });
    const cards = cardsService.createStoreSlot(db);
    const decksService = createOIMSlotCollectionService({ slotContentService: new OIMSlotContentSetBucketService<TCardSlot>() });
    const decks = decksService.createStoreSlot(db);
    const entitiesByKey = (key: TOIMStoreKey): (TCard | undefined)[] =>
        Array.from(decksService.slotContentService.getBucketMemberSlots(decksService.getSlotByKey(decks, key)), cardSlot => cardSlot.entity);
    return { db, cardsService, cards, decksService, decks, entitiesByKey };
};

describe('a caller who never names a slot', () => {
    it('reads the entity straight off the key', () => {
        const { db, cardsService, cards } = createFixture();
        cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'one' });
        db.flush();

        expect(cardsService.findSlotByKey(cards, 'c1')?.entity).toEqual({ id: 'c1', title: 'one' });
    });

    it('is answered with nothing for a key nothing wrote, and files no identity for the ask', () => {
        const { cardsService, cards } = createFixture();

        expect(cardsService.findSlotByKey(cards, 'never-written')?.entity).toBeUndefined();
        expect(cardsService.getSlotCount(cards)).toBe(0);
    });

    it('reads a bucket as entities, in the order the bucket holds them', () => {
        const { db, cardsService, cards, decksService, decks, entitiesByKey } = createFixture();
        cardsService.writeInBatch(cards, () => ([{ id: 'c1', title: 'one' }, { id: 'c2', title: 'two' }]).map(entity => cardsService.writeSlotContentByKey(cards, entity.id, entity)));
        db.flush();
        const deck = decksService.holdSlotByKey(decks, 'spades');
        decksService.slotContentService.writeSlotContent(deck, [cardsService.getSlotByKey(cards, 'c1'), cardsService.getSlotByKey(cards, 'c2')]);
        db.flush();

        expect(entitiesByKey('spades')).toEqual([
            { id: 'c1', title: 'one' },
            { id: 'c2', title: 'two' },
        ]);
        deck.owner.unholdSlot(deck);
    });

    it('hands upsertMany straight to a bucket write: every row in input order, changed or not', () => {
        const { db, cardsService, cards, decksService, decks, entitiesByKey } = createFixture();
        cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'one' });
        db.flush();
        const changed: TOIMEntitySlot<TCard, TOIMStoreKey>[] = [];
        const rows = [{ id: 'c2', title: 'two' }, { id: 'c1', title: 'one' }, { id: 'c3', title: 'three' }];

        const slots = cardsService.writeInBatch(cards, () => (rows).map(entity => cardsService.writeSlotContentByKey(cards, entity.id, entity, changed)));
        decksService.slotContentService.writeSlotContent(decksService.getSlotByKey(decks, 'spades'), slots);
        db.flush();

        expect(changed.length).toBe(2);
        expect(changed[0]).toBe(cardsService.getSlotByKey(cards, 'c2'));
        expect(changed[1]).toBe(cardsService.getSlotByKey(cards, 'c3'));
        expect(slots.length).toBe(3);
        expect(slots[0]).toBe(cardsService.getSlotByKey(cards, 'c2'));
        expect(slots[1]).toBe(cardsService.getSlotByKey(cards, 'c1'));
        expect(slots[2]).toBe(cardsService.getSlotByKey(cards, 'c3'));
        expect(entitiesByKey('spades')).toEqual(rows);
    });

    it('is answered with an empty list for a bucket nobody filed, and that bucket goes at the flush', () => {
        const { db, decksService, decks, entitiesByKey } = createFixture();

        expect(entitiesByKey('never-resolved')).toEqual([]);
        expect(decksService.getSlotCount(decks)).toBe(1);

        db.flush();

        expect(decksService.getSlotCount(decks)).toBe(0);
    });

    it('keeps the hole where a row the bucket still holds has lost its value', () => {
        const { db, cardsService, cards, decksService, decks, entitiesByKey } = createFixture();
        cardsService.writeInBatch(cards, () => ([{ id: 'c1', title: 'one' }, { id: 'c2', title: 'two' }]).map(entity => cardsService.writeSlotContentByKey(cards, entity.id, entity)));
        db.flush();
        const deck = decksService.holdSlotByKey(decks, 'spades');
        decksService.slotContentService.writeSlotContent(deck, [cardsService.getSlotByKey(cards, 'c1'), cardsService.getSlotByKey(cards, 'c2')]);
        db.flush();

        const card = cardsService.findSlotByKey(cards, 'c1');
        if (card !== undefined) cardsService.slotContentService.clearSlotContent(card);
        db.flush();

        expect(entitiesByKey('spades')).toEqual([undefined, { id: 'c2', title: 'two' }]);
        expect(decksService.slotContentService.getBucketMemberSlotCount(deck)).toBe(2);
        deck.owner.unholdSlot(deck);
    });
});

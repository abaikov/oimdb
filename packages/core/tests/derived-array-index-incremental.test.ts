import {
    OIMDerivedCollectionIndexArrayBased,
    OIMEventQueue,
    OIMReactiveCollection,
} from '../src';

type Card = {
    id: string;
    deckId?: string;
    title: string;
    position: number;
};

describe('OIMDerivedCollectionIndexArrayBased — incremental updates', () => {
    function setup() {
        const queue = new OIMEventQueue();
        const cards = new OIMReactiveCollection<Card, string>(queue, {
            selectPk: card => card.id,
        });
        cards.upsertMany([
            { id: 'c1', deckId: 'deck1', title: 'One', position: 2 },
            { id: 'c2', deckId: 'deck1', title: 'Two', position: 1 },
            { id: 'c3', deckId: 'deck2', title: 'Three', position: 1 },
        ]);
        const cardsByDeck = new OIMDerivedCollectionIndexArrayBased<
            string,
            string,
            Card
        >(queue, cards, {
            selectIndexKeys: card => card.deckId,
            orderBy: card => card.position,
        });
        return { queue, cards, cardsByDeck };
    }

    test('a non-key, non-order field change does not rebuild the index', () => {
        const { queue, cards, cardsByDeck } = setup();
        const getAllSlotsSpy = jest.spyOn(cards, 'getAllSlots');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const setSlotsSpy = jest.spyOn(cardsByDeck as any, 'setSlots');

        // Only the title changes — neither the derived key nor the sort value.
        cards.upsertOne({
            id: 'c1',
            deckId: 'deck1',
            title: 'One!!!',
            position: 2,
        });

        // No whole-collection scan and no bucket rewrite for an irrelevant change.
        expect(getAllSlotsSpy).not.toHaveBeenCalled();
        expect(setSlotsSpy).not.toHaveBeenCalled();
        // State is intact.
        expect(cardsByDeck.getPksByKey('deck1')).toEqual(['c2', 'c1']);

        getAllSlotsSpy.mockRestore();
        setSlotsSpy.mockRestore();
        cardsByDeck.destroy();
        cards.destroy();
        queue.destroy();
    });

    test('an order-field change re-sorts the affected key without a full scan', () => {
        const { queue, cards, cardsByDeck } = setup();
        const getAllSlotsSpy = jest.spyOn(cards, 'getAllSlots');

        // c1 moves to the front of deck1 by position.
        cards.upsertOne({
            id: 'c1',
            deckId: 'deck1',
            title: 'One',
            position: 0,
        });

        expect(getAllSlotsSpy).not.toHaveBeenCalled();
        expect(cardsByDeck.getPksByKey('deck1')).toEqual(['c1', 'c2']);

        getAllSlotsSpy.mockRestore();
        cardsByDeck.destroy();
        cards.destroy();
        queue.destroy();
    });

    test('a key change moves membership without a full scan', () => {
        const { queue, cards, cardsByDeck } = setup();
        const getAllSlotsSpy = jest.spyOn(cards, 'getAllSlots');

        // c3 moves deck2 -> deck1 at position 5 (after c2=1, c1=2).
        cards.upsertOne({
            id: 'c3',
            deckId: 'deck1',
            title: 'Three',
            position: 5,
        });

        expect(getAllSlotsSpy).not.toHaveBeenCalled();
        expect(cardsByDeck.getPksByKey('deck2')).toEqual([]);
        expect(cardsByDeck.getPksByKey('deck1')).toEqual(['c2', 'c1', 'c3']);

        getAllSlotsSpy.mockRestore();
        cardsByDeck.destroy();
        cards.destroy();
        queue.destroy();
    });
});

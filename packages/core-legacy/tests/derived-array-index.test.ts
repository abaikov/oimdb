import {
    createOIMCollectionIndexFactory,
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

describe('OIMDerivedCollectionIndexArrayBased', () => {
    function createCards() {
        const queue = new OIMEventQueue();
        const cards = new OIMReactiveCollection<Card, string>(queue, {
            selectPk: card => card.id,
        });
        cards.upsertMany([
            { id: 'c1', deckId: 'deck1', title: 'One', position: 2 },
            { id: 'c2', deckId: 'deck1', title: 'Two', position: 1 },
            { id: 'c3', deckId: 'deck2', title: 'Three', position: 1 },
        ]);
        return { queue, cards };
    }

    test('builds initial ordered state from existing collection slots', () => {
        const { queue, cards } = createCards();
        const cardsByDeck = new OIMDerivedCollectionIndexArrayBased<
            string,
            string,
            Card
        >(queue, cards, {
            selectIndexKeys: card => card.deckId,
            orderBy: card => card.position,
        });

        expect(cardsByDeck.getPksByKey('deck1')).toEqual(['c2', 'c1']);
        expect(cardsByDeck.getEntitiesByKey('deck2')).toEqual([
            { id: 'c3', deckId: 'deck2', title: 'Three', position: 1 },
        ]);

        cardsByDeck.destroy();
        cards.destroy();
        queue.destroy();
    });

    test('moves membership when derived key changes', () => {
        const { queue, cards } = createCards();
        const cardsByDeck = new OIMDerivedCollectionIndexArrayBased<
            string,
            string,
            Card
        >(queue, cards, {
            selectIndexKeys: card => card.deckId,
            orderBy: card => card.position,
        });

        cards.upsertOneByPk('c1', { deckId: 'deck2', position: 3 });

        expect(cardsByDeck.getPksByKey('deck1')).toEqual(['c2']);
        expect(cardsByDeck.getPksByKey('deck2')).toEqual(['c3', 'c1']);

        cardsByDeck.destroy();
        cards.destroy();
        queue.destroy();
    });

    test('resorts when order field changes without membership changes', () => {
        const { queue, cards } = createCards();
        const cardsByDeck = new OIMDerivedCollectionIndexArrayBased<
            string,
            string,
            Card
        >(queue, cards, {
            selectIndexKeys: card => card.deckId,
            orderBy: card => card.position,
        });

        cards.upsertOneByPk('c1', { position: 0 });

        expect(cardsByDeck.getPksByKey('deck1')).toEqual(['c1', 'c2']);

        cardsByDeck.destroy();
        cards.destroy();
        queue.destroy();
    });

    test('removes membership when entity is removed', () => {
        const { queue, cards } = createCards();
        const cardsByDeck = new OIMDerivedCollectionIndexArrayBased<
            string,
            string,
            Card
        >(queue, cards, {
            selectIndexKeys: card => card.deckId,
            orderBy: card => card.position,
        });

        cards.removeOneByPk('c2');

        expect(cardsByDeck.getPksByKey('deck1')).toEqual(['c1']);

        cardsByDeck.destroy();
        cards.destroy();
        queue.destroy();
    });

    test('relations helper creates derived array indexes', () => {
        const { queue, cards } = createCards();
        const indexFactory = createOIMCollectionIndexFactory(queue, cards);
        const cardsByDeck = indexFactory.derivedArrayIndex(
            card => card.deckId,
            { orderBy: card => card.position }
        );

        cards.upsertOne({ id: 'c4', deckId: 'deck1', title: 'Four', position: 0 });

        expect(cardsByDeck.getPksByKey('deck1')).toEqual(['c4', 'c2', 'c1']);

        cardsByDeck.destroy();
        cards.destroy();
        queue.destroy();
    });
});

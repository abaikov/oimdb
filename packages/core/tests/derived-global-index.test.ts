import {
    createOIMCollectionIndexFactory,
    OIMDerivedCollectionGlobalIndexArrayBased,
    OIMDerivedCollectionGlobalIndexSetBased,
    OIMEventQueue,
    OIMReactiveCollection,
} from '../src';

type Card = {
    id: string;
    title: string;
    position: number;
    archived?: boolean;
};

function createCards() {
    const queue = new OIMEventQueue();
    const cards = new OIMReactiveCollection<Card, string>(queue, {
        selectPk: card => card.id,
    });
    cards.upsertMany([
        { id: 'c1', title: 'One', position: 2 },
        { id: 'c2', title: 'Two', position: 1 },
        { id: 'c3', title: 'Three', position: 3 },
    ]);
    return { queue, cards };
}

describe('OIMDerivedCollectionGlobalIndexArrayBased', () => {
    test('builds an initial ordered list from the whole collection', () => {
        const { queue, cards } = createCards();
        const list = new OIMDerivedCollectionGlobalIndexArrayBased<string, Card>(
            queue,
            cards,
            { orderBy: card => card.position }
        );

        expect(list.getPks()).toEqual(['c2', 'c1', 'c3']);

        list.destroy();
        cards.destroy();
        queue.destroy();
    });

    test('adds a new entity into the ordered position', () => {
        const { queue, cards } = createCards();
        const list = new OIMDerivedCollectionGlobalIndexArrayBased<string, Card>(
            queue,
            cards,
            { orderBy: card => card.position }
        );

        cards.upsertOne({ id: 'c4', title: 'Four', position: 0 });
        expect(list.getPks()).toEqual(['c4', 'c2', 'c1', 'c3']);

        list.destroy();
        cards.destroy();
        queue.destroy();
    });

    test('resorts when the order field changes', () => {
        const { queue, cards } = createCards();
        const list = new OIMDerivedCollectionGlobalIndexArrayBased<string, Card>(
            queue,
            cards,
            { orderBy: card => card.position }
        );

        cards.upsertOneByPk('c3', { position: 0 });
        expect(list.getPks()).toEqual(['c3', 'c2', 'c1']);

        list.destroy();
        cards.destroy();
        queue.destroy();
    });

    test('removes an entity from the list when it is removed', () => {
        const { queue, cards } = createCards();
        const list = new OIMDerivedCollectionGlobalIndexArrayBased<string, Card>(
            queue,
            cards,
            { orderBy: card => card.position }
        );

        cards.removeOneByPk('c2');
        expect(list.getPks()).toEqual(['c1', 'c3']);

        list.destroy();
        cards.destroy();
        queue.destroy();
    });

    test('filter excludes entities and reacts to filter-field changes', () => {
        const { queue, cards } = createCards();
        const list = new OIMDerivedCollectionGlobalIndexArrayBased<string, Card>(
            queue,
            cards,
            {
                orderBy: card => card.position,
                filter: card => !card.archived,
            }
        );

        expect(list.getPks()).toEqual(['c2', 'c1', 'c3']);

        cards.upsertOneByPk('c1', { archived: true });
        expect(list.getPks()).toEqual(['c2', 'c3']);

        cards.upsertOneByPk('c1', { archived: false });
        expect(list.getPks()).toEqual(['c2', 'c1', 'c3']);

        list.destroy();
        cards.destroy();
        queue.destroy();
    });

    test('rebuilds from scratch on collection.clear()', () => {
        const { queue, cards } = createCards();
        const list = new OIMDerivedCollectionGlobalIndexArrayBased<string, Card>(
            queue,
            cards,
            { orderBy: card => card.position }
        );

        cards.clear();
        expect(list.getPks()).toEqual([]);

        cards.upsertOne({ id: 'c9', title: 'Nine', position: 1 });
        expect(list.getPks()).toEqual(['c9']);

        list.destroy();
        cards.destroy();
        queue.destroy();
    });

    test('factory helper creates a derived global array list', () => {
        const { queue, cards } = createCards();
        const indexFactory = createOIMCollectionIndexFactory(queue, cards);
        const list = indexFactory.derivedArrayGlobalIndex({
            orderBy: card => card.position,
        });

        expect(list.getPks()).toEqual(['c2', 'c1', 'c3']);

        list.destroy();
        cards.destroy();
        queue.destroy();
    });
});

describe('OIMDerivedCollectionGlobalIndexSetBased', () => {
    test('tracks whole-collection membership', () => {
        const { queue, cards } = createCards();
        const set = new OIMDerivedCollectionGlobalIndexSetBased<string, Card>(
            queue,
            cards,
            {}
        );

        expect(set.getPks()).toEqual(new Set(['c1', 'c2', 'c3']));

        cards.upsertOne({ id: 'c4', title: 'Four', position: 4 });
        cards.removeOneByPk('c1');
        expect(set.getPks()).toEqual(new Set(['c2', 'c3', 'c4']));

        set.destroy();
        cards.destroy();
        queue.destroy();
    });

    test('filter applies to the derived set', () => {
        const { queue, cards } = createCards();
        const set = new OIMDerivedCollectionGlobalIndexSetBased<string, Card>(
            queue,
            cards,
            { filter: card => card.position >= 2 }
        );

        expect(set.getPks()).toEqual(new Set(['c1', 'c3']));

        set.destroy();
        cards.destroy();
        queue.destroy();
    });
});

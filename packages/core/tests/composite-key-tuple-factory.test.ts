import {
    OIMCollectionStoreTrieDriven,
    OIMEventQueue,
    OIMReactiveCollection,
    ctk,
} from '../src';
import type { TOIMKeyPath } from '../src';

type TCardKeys = { boardId: string; cardId: number };
type Card = TCardKeys & { title: string; tags: Set<string> };

describe('OIMCompositeKeyTupleFactory', () => {
    const cardKey = ctk<TCardKeys>()(['boardId', 'cardId']);

    test('projects named fields into the declared order', () => {
        expect(cardKey({ boardId: 'b1', cardId: 9 })).toEqual(['b1', 9]);
        // Field order at the call site is irrelevant — the declaration owns the order.
        expect(cardKey({ cardId: 9, boardId: 'b1' })).toEqual(['b1', 9]);
    });

    test('what ctk hands back is the builder itself — one call, no method access', () => {
        expect(typeof cardKey).toBe('function');
        // Detached from any instance and still correct: it reads only the captured names.
        const detached = cardKey;
        expect(detached({ boardId: 'b1', cardId: 9 })).toEqual(['b1', 9]);
    });

    test('an entity satisfies it structurally, so one factory serves both sides', () => {
        const card: Card = {
            boardId: 'b1',
            cardId: 9,
            title: 'x',
            tags: new Set(),
        };
        expect(cardKey(card)).toEqual(['b1', 9]);
    });

    test('segment types survive: a number stays a number, not a string', () => {
        const [board, id] = cardKey({ boardId: 'b1', cardId: 9 });
        expect(typeof board).toBe('string');
        expect(typeof id).toBe('number');
    });

    test('a fresh tuple resolves to the same entity as the stored one', () => {
        const queue = new OIMEventQueue();
        const cards = new OIMReactiveCollection<Card, TOIMKeyPath>(queue, {
            selectPk: card => cardKey(card),
            store: new OIMCollectionStoreTrieDriven<Card>(),
        });

        const card: Card = {
            boardId: 'b1',
            cardId: 9,
            title: 'first',
            tags: new Set(),
        };
        cards.upsertOne(card);
        queue.flush();

        // Built separately, matched by content — this is the whole point of the tuple form.
        expect(cards.getOneByPk(cardKey({ boardId: 'b1', cardId: 9 }))?.title).toBe(
            'first'
        );
        // A different segment value is a different bucket, and `1` never collides with `'1'`.
        expect(
            cards.getOneByPk(cardKey({ boardId: 'b1', cardId: 10 }))
        ).toBeUndefined();

        queue.destroy();
    });

    test('rejects a shape it could not address unambiguously', () => {
        expect(() => ctk<TCardKeys>()([])).toThrow(/at least one segment/);
        expect(() =>
            ctk<TCardKeys>()(['boardId', 'boardId'])
        ).toThrow(/duplicate segment name/);
    });
});

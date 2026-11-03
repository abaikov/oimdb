import { OIMDB, createOIMSortedComputedService, createOIMSlotCollectionIndexService } from '../../index';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';
import { readValueWithoutTracking } from '../../../tests/support/readValueWithoutTracking';

type TCard = { id: string; deck: string; a: number; b: number };

const createFixture = (columns: readonly ('a' | 'b')[]) => {
    const db = new OIMDB();
    const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard, string>() });
    const cards = cardsService.createStoreSlot(db);
    const byDeckService = createOIMSlotCollectionIndexService({ entityService: cardsService, keyOf: (card: TCard) => card.deck });
    const byDeck = byDeckService.createIndexStoreSlot(cards);
    const sortedService = createOIMSortedComputedService({
        indexService: byDeckService,
        sortColumns: columns.map(columnName => ({ columnName, direction: 'asc' as const })),
        comparator: (left: TCard, right: TCard) => left.b - right.b,
    });
    const sorted = sortedService.createSortedStoreSlot(byDeck);
    cardsService.writeSlotContentByKey(cards, 'x', { id: 'x', deck: 'd', a: 1, b: 1 });
    cardsService.writeSlotContentByKey(cards, 'y', { id: 'y', deck: 'd', a: 1, b: 2 });
    const sortedSlot = sortedService.holdSlotByKey(sorted, 'd');
    const order = (): string => readValueWithoutTracking(sortedSlot).map(entitySlot => String(entitySlot.key)).join(',');
    order();
    const updateCard = (id: string, patch: Partial<TCard>): void => {
        const cardSlot = cardsService.peekSlotByKey(cards, id);
        if (cardSlot !== undefined) cardsService.slotContentService.updateEntity(cardSlot, patch);
    };
    return { db, updateCard, order };
};

describe('what a sort given both columns and a comparator wakes for', () => {
    it('orders by the comparator and re-sorts when a column it reads, listed in columns, changes', () => {
        const { db, updateCard, order } = createFixture(['a', 'b']);

        updateCard('x', { b: 3 });
        db.flush();

        expect(order()).toBe('y,x');
    });

    it('does not re-sort for a column the comparator reads but columns does not list — columns is what wakes it', () => {
        const { db, updateCard, order } = createFixture(['a']);

        updateCard('x', { b: 3 });
        db.flush();

        expect(order()).toBe('x,y');
    });
});

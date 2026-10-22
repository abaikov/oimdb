import { OIMDB, createOIMComputedServiceSorted, createOIMEntityService, createOIMIndexService } from '../../../index';

type TCard = { id: string; deck: string; a: number; b: number };

const createFixture = (columns: readonly ('a' | 'b')[]) => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    const byDeckService = createOIMIndexService(db, { entityService: cardsService, keyOf: (card: TCard) => card.deck });
    const byDeck = byDeckService.createIndexStoreSlot(cards);
    const sortedService = createOIMComputedServiceSorted({
        indexService: byDeckService,
        sortColumns: columns.map(column => ({ column, direction: 'asc' as const })),
        comparator: (left: TCard, right: TCard) => left.b - right.b,
    });
    const sorted = sortedService.createSortedStoreSlot(byDeck);
    cardsService.slotContentService.upsertEntity(cards, { id: 'x', deck: 'd', a: 1, b: 1 });
    cardsService.slotContentService.upsertEntity(cards, { id: 'y', deck: 'd', a: 1, b: 2 });
    const sortedSlot = sortedService.computedCollectionService.holdSlotByKey(sorted, 'd');
    const order = (): string => sortedSlot.computedValueService.getValueForSlot(sortedSlot).map(entitySlot => String(entitySlot.key)).join(',');
    order();
    const updateCard = (id: string, patch: Partial<TCard>): void => {
        const cardSlot = cardsService.findSlotByKey(cards, id);
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

import { OIMDB, createOIMSortedComputedService, createOIMSlotCollectionIndexService } from '../../../index';
import { createOIMSlotContentEntityService } from '../../../factories/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../../factories/createOIMSlotCollectionService';

type TCard = { id: string; deck: string; a: number; b: number };

const createFixture = (columns: readonly ('a' | 'b')[]) => {
    const db = new OIMDB();
    const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard, string>(db) });
    const cards = cardsService.createStoreSlot(db);
    const byDeckService = createOIMSlotCollectionIndexService(db, { entityService: cardsService, keyOf: (card: TCard) => card.deck });
    const byDeck = byDeckService.createIndexStoreSlot(cards);
    const sortedService = createOIMSortedComputedService({
        indexService: byDeckService,
        sortColumns: columns.map(column => ({ column, direction: 'asc' as const })),
        comparator: (left: TCard, right: TCard) => left.b - right.b,
    });
    const sorted = sortedService.createSortedStoreSlot(byDeck);
    cardsService.writeSlotContentByKey(cards, 'x', { id: 'x', deck: 'd', a: 1, b: 1 });
    cardsService.writeSlotContentByKey(cards, 'y', { id: 'y', deck: 'd', a: 1, b: 2 });
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

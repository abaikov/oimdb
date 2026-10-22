import { OIMDB, createOIMComputedServiceSorted, createOIMEntityService, createOIMIndexService } from '../../../index';

type TCard = { id: string; deck: string; rank: number };

const MEMBER_COUNT = 200;

const createFixture = () => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    const byDeckService = createOIMIndexService(db, { entityService: cardsService, keyOf: (card: TCard) => card.deck });
    const byDeck = byDeckService.createIndexStoreSlot(cards);
    const sortedService = createOIMComputedServiceSorted({
        indexService: byDeckService,
        sortColumns: [{ column: 'rank', direction: 'asc' }],
    });
    const sorted = sortedService.createSortedStoreSlot(byDeck);
    const cardsToInsert: TCard[] = [];
    for (let i = 0; i < MEMBER_COUNT; i++) cardsToInsert.push({ id: `c${i}`, deck: 'd', rank: MEMBER_COUNT - i });
    cardsService.slotContentService.upsertEntities(cards, cardsToInsert);
    cardsService.slotContentService.upsertEntity(cards, { id: 'away', deck: 'other', rank: 0 });
    db.flush();
    const sortedSlot = sortedService.computedCollectionService.holdSlotByKey(sorted, 'd');
    const order = (): string[] => sortedSlot.computedValueService.getValueForSlot(sortedSlot).map(entitySlot => String(entitySlot.key));
    order();
    const hasBucketMemberSlot = jest.spyOn(byDeckService.slotContentService, 'hasBucketMemberSlot');
    const updateCard = (id: string, patch: Partial<TCard>): void => {
        const cardSlot = cardsService.findSlotByKey(cards, id);
        if (cardSlot !== undefined) cardsService.slotContentService.updateEntity(cardSlot, patch);
    };
    return { db, updateCard, order, hasBucketMemberSlot };
};

describe('what a sorted bucket asks the index after a write', () => {
    it('asks about the one member a write moved out, not about every member', () => {
        const { db, updateCard, order, hasBucketMemberSlot } = createFixture();

        updateCard('c5', { deck: 'other' });
        db.flush();
        const ids = order();

        expect(ids).toHaveLength(MEMBER_COUNT - 1);
        expect(ids).not.toContain('c5');
        expect(hasBucketMemberSlot.mock.calls.length).toBeLessThanOrEqual(1);
    });

    it('asks about nothing when a write moves one entity in', () => {
        const { db, updateCard, order, hasBucketMemberSlot } = createFixture();

        updateCard('away', { deck: 'd' });
        db.flush();
        const ids = order();

        expect(ids[0]).toBe('away');
        expect(ids).toHaveLength(MEMBER_COUNT + 1);
        expect(hasBucketMemberSlot).not.toHaveBeenCalled();
    });

    it('keeps the order right when one write moves a member out and another moves one in', () => {
        const { db, updateCard, order } = createFixture();

        updateCard('c0', { deck: 'other' });
        updateCard('away', { deck: 'd', rank: 1000 });
        db.flush();
        const ids = order();

        expect(ids).toHaveLength(MEMBER_COUNT);
        expect(ids).not.toContain('c0');
        expect(ids[ids.length - 1]).toBe('away');
        expect(ids[0]).toBe(`c${MEMBER_COUNT - 1}`);
    });

    it('keeps a member a write touched without moving it', () => {
        const { db, updateCard, order } = createFixture();

        updateCard('c7', { rank: -1 });
        db.flush();
        const ids = order();

        expect(ids).toHaveLength(MEMBER_COUNT);
        expect(ids[0]).toBe('c7');
    });
});

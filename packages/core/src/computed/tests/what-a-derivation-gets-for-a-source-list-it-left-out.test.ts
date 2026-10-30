import { OIMDB } from '../../index';
import { createOIMSlotContentEntityService } from '../../entity/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';
import { createOIMSingleComputedService } from '../../index';

type TCard = { id: string; n: number };

const createNumberService = () => {
    const computedService = createOIMSingleComputedService<number>();
    const collectionService = computedService.computedSingleSlotService;
    type TStoreSlot = Parameters<typeof collectionService.getSingleSlot>[0];
    return {
        createComputedStoreSlot: computedService.createComputedStoreSlot.bind(computedService),
        getSingleSlot: (storeSlot: TStoreSlot) => collectionService.getSingleSlot(storeSlot),
        getSingleValue: (storeSlot: TStoreSlot) => {
            const computedSlot = collectionService.getSingleSlot(storeSlot);
            return computedSlot.computedValueService.getValueForSlot(computedSlot);
        },
    };
};

describe('what a derivation gets for a source list it left out', () => {
    it('reads no sources at all when createSources names neither list', () => {
        const db = new OIMDB();
        const constantService = createNumberService();
        const constant = constantService.createComputedStoreSlot(db, () => 42, () => ({}));
        const computedSlot = constantService.getSingleSlot(constant);

        expect(constantService.getSingleValue(constant)).toBe(42);
        expect(computedSlot.sourceSlots).toHaveLength(0);
        expect(computedSlot.sourceComputeds).toHaveLength(0);
        expect(Object.isFrozen(computedSlot.sourceSlots)).toBe(true);
        expect(Object.isFrozen(computedSlot.sourceComputeds)).toBe(true);
    });

    it('derives again when a named source slot moves, with no source computeds named', () => {
        const db = new OIMDB();
        const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard, string>(db) });
        const cards = cardsService.createStoreSlot(db);
        const card = cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', n: 1 });
        const doubledService = createNumberService();
        const doubled = doubledService.createComputedStoreSlot(db, () => (card.entity?.n ?? 0) * 2, () => ({ sourceSlots: [card] }));

        expect(doubledService.getSingleValue(doubled)).toBe(2);
        cardsService.slotContentService.updateEntity(cardsService.findSlotByKey(cards, 'a')!, { n: 5 });
        expect(doubledService.getSingleValue(doubled)).toBe(10);
        expect(doubledService.getSingleSlot(doubled).sourceComputeds).toHaveLength(0);
    });

    it('derives again when a named source computed moves, with no source slots named', () => {
        const db = new OIMDB();
        const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard, string>(db) });
        const cards = cardsService.createStoreSlot(db);
        const card = cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', n: 1 });
        const doubledService = createNumberService();
        const doubled = doubledService.createComputedStoreSlot(db, () => (card.entity?.n ?? 0) * 2, () => ({ sourceSlots: [card] }));
        const plusOneService = createNumberService();
        const plusOne = plusOneService.createComputedStoreSlot(
            db,
            () => doubledService.getSingleValue(doubled) + 1,
            () => ({ sourceComputeds: [doubledService.getSingleSlot(doubled)] }),
        );

        expect(plusOneService.getSingleValue(plusOne)).toBe(3);
        cardsService.slotContentService.updateEntity(cardsService.findSlotByKey(cards, 'a')!, { n: 2 });
        expect(plusOneService.getSingleValue(plusOne)).toBe(5);
        expect(plusOneService.getSingleSlot(plusOne).sourceSlots).toHaveLength(0);
    });
});

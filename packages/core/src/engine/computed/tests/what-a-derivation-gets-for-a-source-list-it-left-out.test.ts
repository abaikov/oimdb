import { OIMDB, OIMSlotStoreServiceSingleSlotDriven, createOIMComputedService, createOIMEntityService } from '../../../index';
import type { TOIMComputedSlot, TOIMSingleSlotStore } from '../../../index';

type TCard = { id: string; n: number };

const createNumberService = () => {
    const computedService = createOIMComputedService<
        void, number, TOIMSingleSlotStore<TOIMComputedSlot<number, void>>
    >({ computedSlotStoreService: new OIMSlotStoreServiceSingleSlotDriven<TOIMComputedSlot<number, void>>() });
    const collectionService = computedService.computedCollectionService;
    type TStoreSlot = Parameters<typeof collectionService.getSlotByKey>[0];
    return {
        createComputedStoreSlot: computedService.createComputedStoreSlot.bind(computedService),
        getSlotByKey: (storeSlot: TStoreSlot, key: undefined) => collectionService.getSlotByKey(storeSlot, key),
        getValueByKey: (storeSlot: TStoreSlot, key: undefined) => {
            const computedSlot = collectionService.getSlotByKey(storeSlot, key);
            return computedSlot.computedValueService.getValueForSlot(computedSlot);
        },
    };
};

describe('what a derivation gets for a source list it left out', () => {
    it('reads no sources at all when createSources names neither list', () => {
        const db = new OIMDB();
        const constantService = createNumberService();
        const constant = constantService.createComputedStoreSlot(db, () => 42, () => ({}));
        const computedSlot = constantService.getSlotByKey(constant, undefined);

        expect(constantService.getValueByKey(constant, undefined)).toBe(42);
        expect(computedSlot.sourceSlots).toHaveLength(0);
        expect(computedSlot.sourceComputeds).toHaveLength(0);
        expect(Object.isFrozen(computedSlot.sourceSlots)).toBe(true);
        expect(Object.isFrozen(computedSlot.sourceComputeds)).toBe(true);
    });

    it('derives again when a named source slot moves, with no source computeds named', () => {
        const db = new OIMDB();
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        const card = cardsService.slotContentService.upsertEntity(cards, { id: 'a', n: 1 });
        const doubledService = createNumberService();
        const doubled = doubledService.createComputedStoreSlot(db, () => (card.entity?.n ?? 0) * 2, () => ({ sourceSlots: [card] }));

        expect(doubledService.getValueByKey(doubled, undefined)).toBe(2);
        cardsService.slotContentService.updateEntity(cardsService.findSlotByKey(cards, 'a')!, { n: 5 });
        expect(doubledService.getValueByKey(doubled, undefined)).toBe(10);
        expect(doubledService.getSlotByKey(doubled, undefined).sourceComputeds).toHaveLength(0);
    });

    it('derives again when a named source computed moves, with no source slots named', () => {
        const db = new OIMDB();
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        const card = cardsService.slotContentService.upsertEntity(cards, { id: 'a', n: 1 });
        const doubledService = createNumberService();
        const doubled = doubledService.createComputedStoreSlot(db, () => (card.entity?.n ?? 0) * 2, () => ({ sourceSlots: [card] }));
        const plusOneService = createNumberService();
        const plusOne = plusOneService.createComputedStoreSlot(
            db,
            () => doubledService.getValueByKey(doubled, undefined) + 1,
            () => ({ sourceComputeds: [doubledService.getSlotByKey(doubled, undefined)] }),
        );

        expect(plusOneService.getValueByKey(plusOne, undefined)).toBe(3);
        cardsService.slotContentService.updateEntity(cardsService.findSlotByKey(cards, 'a')!, { n: 2 });
        expect(plusOneService.getValueByKey(plusOne, undefined)).toBe(5);
        expect(plusOneService.getSlotByKey(plusOne, undefined).sourceSlots).toHaveLength(0);
    });
});

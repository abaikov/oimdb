import { OIMDB, OIMSlotStoreServiceSingleSlotDriven, createOIMComputedService, createOIMEntityService } from '../../../index';
import type { TOIMComputedSlot, TOIMSameValueGuard, TOIMSingleSlotStore } from '../../../index';

type TCard = { id: string; n: number };

const createNumberService = (sameValueGuard?: TOIMSameValueGuard<number>) => {
    const computedService = createOIMComputedService<
        void, number, TOIMSingleSlotStore<TOIMComputedSlot<number, void>>
    >({ computedSlotStoreService: new OIMSlotStoreServiceSingleSlotDriven<TOIMComputedSlot<number, void>>(), sameValueGuard });
    const collectionService = computedService.computedCollectionService;
    type TStoreSlot = Parameters<typeof collectionService.getSlotByKey>[0];
    return {
        createComputedStoreSlot: computedService.createComputedStoreSlot.bind(computedService),
        getValueByKey: (storeSlot: TStoreSlot, key: undefined) => {
            const computedSlot = collectionService.getSlotByKey(storeSlot, key);
            return computedSlot.computedValueService.getValueForSlot(computedSlot);
        },
    };
};

describe('what a derivation answers on its first read', () => {
    it('derives once even with no sources at all', () => {
        const db = new OIMDB();
        const constantService = createNumberService();
        const constant = constantService.createComputedStoreSlot(db, () => 42, () => ({}));

        expect(constantService.getValueByKey(constant, undefined)).toBe(42);
    });

    it('takes the new value again after a comparison that threw, instead of keeping the old one as fresh', () => {
        const db = new OIMDB();
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        const card = cardsService.slotContentService.upsertEntity(cards, { id: 'a', n: 1 });
        let refuse = true;
        const doubledService = createNumberService((prev, next) => {
            if (refuse && next === 4) throw new Error('the comparison threw');
            return prev === next;
        });
        const doubled = doubledService.createComputedStoreSlot(
            db,
            () => (card.entity?.n ?? 0) * 2,
            () => ({ sourceSlots: [card] }),
        );
        expect(doubledService.getValueByKey(doubled, undefined)).toBe(2);
        cardsService.slotContentService.updateEntity(cardsService.findSlotByKey(cards, 'a')!, { n: 2 });

        expect(() => doubledService.getValueByKey(doubled, undefined)).toThrow('the comparison threw');
        refuse = false;

        expect(doubledService.getValueByKey(doubled, undefined)).toBe(4);
    });
});

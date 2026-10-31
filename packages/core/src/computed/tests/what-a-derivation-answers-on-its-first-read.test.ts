import { OIMDB } from '../../index';
import type { TOIMSameValueGuard } from '../../index';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';
import { createOIMSingleComputedService } from '../../index';
import { readValueWithoutTracking } from '../../../tests/support/readValueWithoutTracking';

type TCard = { id: string; n: number };

const createNumberService = (sameValueGuard?: TOIMSameValueGuard<number>) => {
    const computedService = createOIMSingleComputedService<number>({ sameValueGuard });
    const collectionService = computedService.computedSingleSlotService;
    type TStoreSlot = Parameters<typeof collectionService.getSingleSlot>[0];
    return {
        createComputedStoreSlot: computedService.createComputedStoreSlot.bind(computedService),
        getSingleValue: (storeSlot: TStoreSlot) => {
            const computedSlot = collectionService.getSingleSlot(storeSlot);
            return readValueWithoutTracking(computedSlot);
        },
    };
};

describe('what a derivation answers on its first read', () => {

    it('takes the new value again after a comparison that threw, instead of keeping the old one as fresh', () => {
        const db = new OIMDB();
        const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard, string>() });
        const cards = cardsService.createStoreSlot(db);
        const card = cardsService.writeSlotContentByKey(cards, 'a', { id: 'a', n: 1 });
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
        expect(doubledService.getSingleValue(doubled)).toBe(2);
        cardsService.slotContentService.updateEntity(cardsService.findSlotByKey(cards, 'a')!, { n: 2 });

        expect(() => doubledService.getSingleValue(doubled)).toThrow('the comparison threw');
        refuse = false;

        expect(doubledService.getSingleValue(doubled)).toBe(4);
    });
});

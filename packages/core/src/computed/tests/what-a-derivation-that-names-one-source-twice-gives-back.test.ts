import { OIMDB } from '../../db/OIMDB';
import { createOIMComputedService } from '../createOIMComputedService';
import { isOIMSameValueZero } from '../../slot/utils/isOIMSameValueZero';
import { isOIMSlotReleased } from '../../slot/utils/isOIMSlotReleased';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';
import { readValueWithoutTracking } from '../../../tests/support/readValueWithoutTracking';

type TCard = { id: string; title: string; rank: number };

const createFixture =() => {
    const db = new OIMDB();
    const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<TCard, string>() });
    const cards = cardsService.createStoreSlot(db);
    const doubledComputedService = createOIMComputedService<string, number>({
        createSources: ({ key: id }) => {
            const slot = cardsService.getSlotByKey(cards, id);
            return { sourceSlots: [slot, slot] };
        },
        derive: computedSlot => (cardsService.getSlotByKey(cards, computedSlot.key).entity?.rank ?? 0) * 2,
        sameValueGuard: isOIMSameValueZero,
    });
    const doubled = doubledComputedService.createStoreSlot(db);
    return { db, cardsService, cards, doubledService: doubledComputedService, doubled };
};

describe('a derivation that names one ROW twice', () => {
    it('takes a reference per mention and gives every one of them back', () => {
        const { db, cardsService, cards, doubledService, doubled } = createFixture();
        cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'one', rank: 3 });
        db.flush();

        const derived = doubledService.holdSlotByKey(doubled, 'c1');
        const card = cardsService.getSlotByKey(cards, 'c1')!;

        expect(card.holdCount).toBe(2);
        expect(readValueWithoutTracking(derived)).toBe(6);

        derived.owner.unholdSlot(derived);

        expect(card.holdCount).toBe(0);
        expect(isOIMSlotReleased(derived)).toBe(true);
        expect(doubledService.getSlotCount(doubled)).toBe(0);
        expect(cardsService.getSlotByKey(cards, 'c1')).toBe(card);
    });

    it('does not take the row with it while the row still carries a value', () => {
        const { db, cardsService, cards, doubledService, doubled } = createFixture();
        cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'one', rank: 3 });
        db.flush();
        const derived = doubledService.holdSlotByKey(doubled, 'c1');

        derived.owner.unholdSlot(derived);

        expect(cardsService.getSlotByKey(cards, 'c1')?.entity).toEqual({ id: 'c1', title: 'one', rank: 3 });
        expect(cardsService.getSlotCount(cards)).toBe(1);
    });
});

describe('a derivation that names one DERIVATION twice', () => {
    it('takes a reference per mention and gives every one of them back', () => {
        const { db, cardsService, cards, doubledService, doubled } = createFixture();
        cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'one', rank: 3 });
        db.flush();
        const base = doubledService.holdSlotByKey(doubled, 'c1');

        const readersComputedService = createOIMComputedService<string, number>({
            createSources: () => ({ sourceComputeds: [base, base] }),
            derive: () => readValueWithoutTracking(base) * 2,
            sameValueGuard: isOIMSameValueZero,
        });
        const readers = readersComputedService.createStoreSlot(db);
        const reader = readersComputedService.holdSlotByKey(readers, 'r');

        expect(base.holdCount).toBe(3);
        expect(readValueWithoutTracking(reader)).toBe(12);

        base.owner.unholdSlot(base);
        expect(doubledService.getSlotByKey(doubled, 'c1')).toBe(base);

        reader.owner.unholdSlot(reader);

        expect(base.holdCount).toBe(0);
        expect(isOIMSlotReleased(base)).toBe(true);
        expect(doubledService.getSlotCount(doubled)).toBe(0);
        expect(cardsService.getSlotByKey(cards, 'c1')?.entity).toEqual({ id: 'c1', title: 'one', rank: 3 });
    });
});

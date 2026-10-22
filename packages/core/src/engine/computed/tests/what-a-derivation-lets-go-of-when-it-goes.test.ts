import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMComputedService } from '../../../factories/createOIMComputedService';
import { OIMUnusedSlotCollectorService } from '../../collector/OIMUnusedSlotCollectorService';
import { oimSameValueZeroGuard } from '../../slot/utils/oimSameValueZeroGuard';
import { oimIsSlotReleased } from '../../slot/utils/oimIsSlotReleased';

type Card = { id: string; title: string; rank: number };

const createFixture =() => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<Card>(db, { keyOf: (card: Card) => card.id });
    const cards = cardsService.createStoreSlot(db);
    const computedService = createOIMComputedService<string, number>({
        createSources: (id: string) => ({ sourceSlots: [cardsService.getSlotByKey(cards, id)] }),
        derive: computedSlot => cardsService.getSlotByKey(cards, computedSlot.key).entity?.rank ?? -1,
        sameValueGuard: oimSameValueZeroGuard,
    });
    const ranks = computedService.createComputedStoreSlot(db);
    const flushUnusedSlots = (): void => OIMUnusedSlotCollectorService.INSTANCE.flush(db.collectorSlot.unusedSlotCollectorSlot);
    return { flushUnusedSlots, cardsService, cards, ranksService: computedService.computedCollectionService, ranks };
};

describe('the holds a derivation took on its roots', () => {
    it('leaves the root unfiled when nothing else was holding it', () => {
        const { flushUnusedSlots, cardsService, cards, ranksService, ranks } = createFixture();
        const heldSlot = ranksService.holdSlotByKey(ranks, 'a');
        const source = cardsService.getSlotByKey(cards, 'a');
        expect(cardsService.getSlotCount(cards)).toBe(1);
        flushUnusedSlots();

        heldSlot.owner.unholdSlot(heldSlot);

        // The root has no value, no listener and no other hold, so the
        // collection that minted it is owed the question and takes it out.
        expect(ranksService.getSlotCount(ranks)).toBe(0);
        expect(source.holdCount).toBe(0);
        expect(oimIsSlotReleased(source)).toBe(true);
        expect(cardsService.getSlotCount(cards)).toBe(0);
    });

    it('leaves a root alone that something else still holds', () => {
        const { flushUnusedSlots, cardsService, cards, ranksService, ranks } = createFixture();
        const heldSlot = ranksService.holdSlotByKey(ranks, 'a');
        cardsService.holdSlotByKey(cards, 'a');
        const mineSlot = cardsService.getSlotByKey(cards, 'a')!;
        flushUnusedSlots();
        heldSlot.owner.unholdSlot(heldSlot);

        // The give-back asks; it does not decide. A root somebody else is
        // holding declines, exactly as every other release path does.
        expect(cardsService.getSlotByKey(cards, 'a')).toBe(mineSlot);
        expect(mineSlot.holdCount).toBe(1);
    });

    it('leaves a root alone that holds a value', () => {
        const { cardsService, cards, ranksService, ranks } = createFixture();
        const source = cardsService.slotContentService.upsertEntity(cards, { id: 'a', title: 'A', rank: 1 });
        const heldSlot = ranksService.holdSlotByKey(ranks, 'a');

        heldSlot.owner.unholdSlot(heldSlot);

        expect(oimIsSlotReleased(source)).toBe(false);
        expect(cardsService.getSlotByKey(cards, 'a')).toBe(source);
        expect(cardsService.getSlotCount(cards)).toBe(1);
    });
});

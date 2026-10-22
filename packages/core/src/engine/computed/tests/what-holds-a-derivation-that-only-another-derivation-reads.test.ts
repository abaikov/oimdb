import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMComputedService } from '../../../factories/createOIMComputedService';
import { OIMUnusedSlotCollectorService } from '../../collector/OIMUnusedSlotCollectorService';
import { oimSameValueZeroGuard } from '../../slot/utils/oimSameValueZeroGuard';
import { oimIsSlotReleased } from '../../slot/utils/oimIsSlotReleased';

type Card = { id: string; title: string; rank: number };

const createFixture =() => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<Card>(db, { keyOf: (card) => card.id });
    const cards = cardsService.createStoreSlot(db);
    const ranksComputedService = createOIMComputedService<string, number>({
        createSources: (id: string) => ({ sourceSlots: [cardsService.getSlotByKey(cards, id)] }),
        derive: computedSlot => cardsService.getSlotByKey(cards, computedSlot.key).entity?.rank ?? 0,
        sameValueGuard: oimSameValueZeroGuard,
    });
    const ranksService = ranksComputedService.computedCollectionService;
    const ranks = ranksComputedService.createComputedStoreSlot(db);
    // THE SHARED ONE, resolved once by the application and closed over below.
    const baselineSlot = ranksService.holdSlotByKey(ranks, 'baseline');
    // AND A COLLECTION OF READERS OF IT. Each derivation reads its own card and
    // the shared derivation — every consumer with a derivation already in scope.
    const relativeComputedService = createOIMComputedService<string, number>({
        createSources: (id: string) => ({ sourceSlots: [cardsService.getSlotByKey(cards, id)], sourceComputeds: [baselineSlot] }),
        derive: computedSlot => (cardsService.getSlotByKey(cards, computedSlot.key).entity?.rank ?? 0) - baselineSlot.computedValueService.getValueForSlot(baselineSlot),
        sameValueGuard: oimSameValueZeroGuard,
    });
    const relative = relativeComputedService.createComputedStoreSlot(db);
    const flushUnusedSlots = (): void => OIMUnusedSlotCollectorService.INSTANCE.flush(db.collectorSlot.unusedSlotCollectorSlot);
    return {
        flushUnusedSlots, cardsService, cards, ranksService, ranks, baselineSlot,
        relativeService: relativeComputedService.computedCollectionService, relative,
    };
};

describe('what holds a derivation that only another derivation reads', () => {
    it('keeps the source filed when the application lets its own hold go', () => {
        const { cardsService, cards, ranksService, ranks, baselineSlot, relativeService, relative } = createFixture();
        const readerSlot = relativeService.holdSlotByKey(relative, 'a');
        cardsService.slotContentService.upsertEntity(cards, { id: 'baseline', title: 'B', rank: 10 });
        cardsService.slotContentService.upsertEntity(cards, { id: 'a', title: 'A', rank: 13 });

        // The application is done with the handle it resolved the shared
        // derivation through. The reader is not done with the derivation.
        baselineSlot.owner.unholdSlot(baselineSlot);

        expect(ranksService.getSlotByKey(ranks, 'baseline')).toBe(baselineSlot);
        expect(baselineSlot.holdCount).toBe(1);
        // And the key still resolves to the identity the reader is reading. A
        // SECOND identity under this key is the whole failure: two derivations
        // over one key, and whoever holds the first never hears from the store
        // again.
        const againSlot = ranksService.holdSlotByKey(ranks, 'baseline');
        expect(againSlot).toBe(baselineSlot);
        againSlot.owner.unholdSlot(againSlot);

        readerSlot.computedValueService.getValueForSlot(readerSlot);
        expect(readerSlot.computedValueService.getValueForSlot(readerSlot)).toBe(3);
    });

    it('takes one hold on the source and gives it back when the reader goes', () => {
        const { flushUnusedSlots, cardsService, cards, ranksService, ranks, baselineSlot, relativeService, relative } = createFixture();
        const readerSlot = relativeService.holdSlotByKey(relative, 'a');
        flushUnusedSlots();

        // Two: the application's, and the reading derivation's.
        expect(baselineSlot.holdCount).toBe(2);

        readerSlot.owner.unholdSlot(readerSlot);

        // The reader went and its hold went with it. The application's stands,
        // so the source stays exactly where it was.
        expect(baselineSlot.holdCount).toBe(1);
        expect(ranksService.getSlotByKey(ranks, 'baseline')).toBe(baselineSlot);

        baselineSlot.owner.unholdSlot(baselineSlot);

        // And now nothing points at it, so its owner takes it out and the
        // cascade reaches the row underneath it.
        expect(oimIsSlotReleased(baselineSlot)).toBe(true);
        expect(ranksService.getSlotCount(ranks)).toBe(0);
        expect(cardsService.getSlotCount(cards)).toBe(0);
    });

    it('leaves a source alone that another reader still has', () => {
        const { ranksService, ranks, baselineSlot, relativeService, relative } = createFixture();
        const firstSlot = relativeService.holdSlotByKey(relative, 'a');
        relativeService.holdSlotByKey(relative, 'b');
        baselineSlot.owner.unholdSlot(baselineSlot);

        firstSlot.owner.unholdSlot(firstSlot);

        // One reader of two let go. The give-back asks; it does not decide.
        expect(ranksService.getSlotByKey(ranks, 'baseline')).toBe(baselineSlot);
        expect(baselineSlot.holdCount).toBe(1);
    });
});

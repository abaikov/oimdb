import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMComputedService } from '../../../factories/createOIMComputedService';
import { OIMUnusedSlotCollectorService } from '../../collector/OIMUnusedSlotCollectorService';
import { oimSameValueZeroGuard } from '../../slot/utils/oimSameValueZeroGuard';

type Card = { id: string; title: string; rank: number };

const createFixture =() => {
    const db = new OIMDB();
    const cardsService = createOIMEntityService<Card>(db, { keyOf: (card) => card.id });
    const cards = cardsService.createStoreSlot(db);
    // Throws on the first build of any key and succeeds after that, so one
    // collection answers both halves: what a failure leaves, and that a later
    // mint of the same key is unaffected by it.
    let owed = 1;
    const computedService = createOIMComputedService<string, number>({
        createSources: (id: string) => {
            const slot = cardsService.getSlotByKey(cards, id);
            if (owed > 0) {
                owed--;
                throw new Error('build: the record is half loaded');
            }
            return { sourceSlots: [slot] };
        },
        derive: computedSlot => cardsService.getSlotByKey(cards, computedSlot.key).entity?.rank ?? -1,
        sameValueGuard: oimSameValueZeroGuard,
    });
    const ranks = computedService.createComputedStoreSlot(db);
    return { db, cardsService, cards, ranksService: computedService.computedCollectionService, ranks };
};

describe('what a build that throws leaves behind', () => {
    it('leaves the source to the frame, and the frame takes it out', () => {
        const { db, cardsService, cards, ranksService, ranks } = createFixture();

        expect(() => ranksService.holdSlotByKey(ranks, 'a')).toThrow('the record is half loaded');

        OIMUnusedSlotCollectorService.INSTANCE.flush(db.collectorSlot.unusedSlotCollectorSlot);
        expect(cardsService.getSlotCount(cards)).toBe(0);
        expect(ranksService.getSlotCount(ranks)).toBe(0);
    });

    it('gives the count back without unfiling what somebody else holds', () => {
        const { cardsService, cards, ranksService, ranks } = createFixture();
        cardsService.holdSlotByKey(cards, 'a');
        const mineSlot = cardsService.getSlotByKey(cards, 'a')!;
        expect(() => ranksService.holdSlotByKey(ranks, 'a')).toThrow('the record is half loaded');

        // One count back, one count standing: the give-back asks the owner and
        // the owner declines for the hold that is still there.
        expect(mineSlot.holdCount).toBe(1);
        expect(cardsService.getSlotByKey(cards, 'a')).toBe(mineSlot);
    });

    it('leaves the key mintable again, with one hold and not two', () => {
        const { db, cardsService, cards, ranksService, ranks } = createFixture();
        expect(() => ranksService.holdSlotByKey(ranks, 'a')).toThrow('the record is half loaded');

        ranksService.holdSlotByKey(ranks, 'a');
        OIMUnusedSlotCollectorService.INSTANCE.flush(db.collectorSlot.unusedSlotCollectorSlot);

        const heldSlot = ranksService.getSlotByKey(ranks, 'a')!;
        expect(ranksService.getSlotByKey(ranks, 'a')).toBe(heldSlot);
        // ONE — the successful build's. A count left behind by the failed one
        // would be indistinguishable from a caller holding the row for reasons
        // the engine cannot see, and would keep it for the life of the process.
        expect(cardsService.getSlotByKey(cards, 'a')!.holdCount).toBe(1);
    });
});

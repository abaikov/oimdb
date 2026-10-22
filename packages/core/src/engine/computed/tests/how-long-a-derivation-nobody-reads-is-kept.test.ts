import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import { createOIMComputedService } from '../../../factories/createOIMComputedService';
import { OIMReleaseSlotCollectorServiceAfterIdle } from '../../collector/OIMReleaseSlotCollectorServiceAfterIdle';
import { OIMSlotReleasePolicyAfterIdle } from '../../collector/OIMSlotReleasePolicyAfterIdle';
import { oimSameValueZeroGuard } from '../../slot/utils/oimSameValueZeroGuard';
import { oimIsSlotReleased } from '../../slot/utils/oimIsSlotReleased';

type Card = { id: string; title: string; rank: number };

const WINDOW = 30_000;
const START = 1_000_000;

const createFixture =(keepAfterIdleMs?: number) => {
    let ms = START;
    const db = new OIMDB({ getNowMs: () => ms, releaseTimer: () => () => undefined });
    const cooling = {
        flush: (): void => OIMReleaseSlotCollectorServiceAfterIdle.INSTANCE.flush(db.collectorSlot.afterIdleReleaseSlotCollectorSlot),
    };
    const cardsService = createOIMEntityService<Card>(db, { keyOf: card => card.id });
    const cards = cardsService.createStoreSlot(db);
    const ranksService = createOIMComputedService<string, number>({
        createSources: (id: string) => ({ sourceSlots: [cardsService.getSlotByKey(cards, id)] }),
        derive: computedSlot => cardsService.getSlotByKey(cards, computedSlot.key).entity?.rank ?? -1,
        sameValueGuard: oimSameValueZeroGuard,
        slotReleasePolicy: keepAfterIdleMs === undefined
            ? undefined
            : new OIMSlotReleasePolicyAfterIdle({ keepAfterIdleMs }),
    });
    const ranks = ranksService.createComputedStoreSlot(db);
    const ranksCollectionService = ranksService.computedCollectionService;
    return { db, cardsService, cards, ranksService: ranksCollectionService, ranks, cooling, at: (value: number): void => { ms = value; } };
};

describe('a derivation the last reader let go of', () => {
    it('goes at once when no cooling was asked for', () => {
        const fixture = createFixture();
        const held = fixture.ranksService.holdSlotByKey(fixture.ranks, 'a');
        void held.computedValueService.getValueForSlot(held);

        held.owner.unholdSlot(held);

        expect(oimIsSlotReleased(held)).toBe(true);
        expect(fixture.ranksService.getSlotCount(fixture.ranks)).toBe(0);
    });

    it('is kept for the cooling window, so the next reader gets the same derivation', () => {
        const fixture = createFixture(WINDOW);
        const held = fixture.ranksService.holdSlotByKey(fixture.ranks, 'a');
        void held.computedValueService.getValueForSlot(held);

        held.owner.unholdSlot(held);

        expect(fixture.ranksService.getSlotByKey(fixture.ranks, 'a')).toBe(held);
        expect(fixture.ranksService.holdSlotByKey(fixture.ranks, 'a')).toBe(held);
    });

    it('goes once the window runs out with nobody having come back', () => {
        const fixture = createFixture(WINDOW);
        const held = fixture.ranksService.holdSlotByKey(fixture.ranks, 'a');
        void held.computedValueService.getValueForSlot(held);
        held.owner.unholdSlot(held);

        fixture.at(START + WINDOW + 1_000);
        fixture.cooling.flush();

        expect(oimIsSlotReleased(held)).toBe(true);
        expect(fixture.ranksService.getSlotCount(fixture.ranks)).toBe(0);
    });

    it('cools a derivation that was built and never read, because the build is what cost', () => {
        const fixture = createFixture(WINDOW);
        const held = fixture.ranksService.holdSlotByKey(fixture.ranks, 'a');

        held.owner.unholdSlot(held);

        expect(fixture.ranksService.getSlotByKey(fixture.ranks, 'a')).toBe(held);
    });
});

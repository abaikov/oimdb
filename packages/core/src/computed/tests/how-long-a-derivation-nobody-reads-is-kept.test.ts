import { OIMDB } from '../../db/OIMDB';
import { createOIMComputedService } from '../createOIMComputedService';
import { OIMSlotAfterIdleReleasePolicy } from '../../collector/OIMSlotAfterIdleReleasePolicy';
import { mintOIMAfterIdleSlotReleaseWheel } from '../../collector/utils/mintOIMAfterIdleSlotReleaseWheel';
import { isOIMSameValueZero } from '../../slot/utils/isOIMSameValueZero';
import { isOIMSlotReleased } from '../../slot/utils/isOIMSlotReleased';
import { createOIMEntityContentService } from '../../entity/createOIMEntityContentService';
import { createOIMSlotCollectionService } from '../../slot/createOIMSlotCollectionService';
import { readValueWithoutTracking } from '../../../tests/support/readValueWithoutTracking';

type Card = { id: string; title: string; rank: number };

const WINDOW = 30_000;
const START = 1_000_000;

const createFixture =(keepAfterIdleMs?: number) => {
    let ms = START;
    const db = new OIMDB({ getNowMs: () => ms, releaseTimer: () => () => undefined });
    const cooling = {
        flush: (): void => mintOIMAfterIdleSlotReleaseWheel(db.collectorSlot).flush(),
    };
    const cardsService = createOIMSlotCollectionService({ slotContentService: createOIMEntityContentService<Card, string>() });
    const cards = cardsService.createStoreSlot(db);
    const ranksService = createOIMComputedService<string, number>({
        createSources: ({ key: id }) => ({ sourceSlots: [cardsService.getSlotByKey(cards, id)] }),
        derive: computedSlot => cardsService.getSlotByKey(cards, computedSlot.key).entity?.rank ?? -1,
        sameValueGuard: isOIMSameValueZero,
        slotReleasePolicy: keepAfterIdleMs === undefined
            ? undefined
            : new OIMSlotAfterIdleReleasePolicy({ keepAfterIdleMs }),
    });
    const ranks = ranksService.createStoreSlot(db);
    return { db, cardsService, cards, ranksService, ranks, cooling, at: (value: number): void => { ms = value; } };
};

describe('a derivation the last reader let go of', () => {
    it('goes at once when no cooling was asked for', () => {
        const fixture = createFixture();
        const held = fixture.ranksService.holdSlotByKey(fixture.ranks, 'a');
        void readValueWithoutTracking(held);

        held.owner.unholdSlot(held);

        expect(isOIMSlotReleased(held)).toBe(true);
        expect(fixture.ranksService.getSlotCount(fixture.ranks)).toBe(0);
    });

    it('is kept for the cooling window, so the next reader gets the same derivation', () => {
        const fixture = createFixture(WINDOW);
        const held = fixture.ranksService.holdSlotByKey(fixture.ranks, 'a');
        void readValueWithoutTracking(held);

        held.owner.unholdSlot(held);

        expect(fixture.ranksService.getSlotByKey(fixture.ranks, 'a')).toBe(held);
        expect(fixture.ranksService.holdSlotByKey(fixture.ranks, 'a')).toBe(held);
    });

    it('goes once the window runs out with nobody having come back', () => {
        const fixture = createFixture(WINDOW);
        const held = fixture.ranksService.holdSlotByKey(fixture.ranks, 'a');
        void readValueWithoutTracking(held);
        held.owner.unholdSlot(held);

        fixture.at(START + WINDOW + 1_000);
        fixture.cooling.flush();

        expect(isOIMSlotReleased(held)).toBe(true);
        expect(fixture.ranksService.getSlotCount(fixture.ranks)).toBe(0);
    });

    it('cools a derivation that was built and never read, because the build is what cost', () => {
        const fixture = createFixture(WINDOW);
        const held = fixture.ranksService.holdSlotByKey(fixture.ranks, 'a');

        held.owner.unholdSlot(held);

        expect(fixture.ranksService.getSlotByKey(fixture.ranks, 'a')).toBe(held);
    });
});

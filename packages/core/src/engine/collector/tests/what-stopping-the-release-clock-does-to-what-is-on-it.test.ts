import { OIMReleaseSlotCollectorServiceAfterIdle } from '../OIMReleaseSlotCollectorServiceAfterIdle';
import { OIMReleaseSlotQueueService } from '../OIMReleaseSlotQueueService';
import { OIMSlotReleasePolicyAfterIdle } from '../OIMSlotReleasePolicyAfterIdle';
import { OIMDB } from '../../../factories/OIMDB';
import { createOIMEntityService } from '../../../factories/createOIMEntityService';
import type { TOIMDisposer } from '../../schedule/types/TOIMDisposer';
import { oimIsSlotReleased } from '../../slot/utils/oimIsSlotReleased';

type TCard = { id: string; title: string };

const START = 1_000_000;
const WINDOW = 30_000;

const createFixtureAt = () => {
    let ms = START;
    let armed: (() => void) | undefined;
    const db = new OIMDB({
        getNowMs: () => ms,
        releaseTimer: (run): TOIMDisposer => { armed = run; return () => { armed = undefined; }; },
    });
    const cardsService = createOIMEntityService<TCard>(db, {
        keyOf: card => card.id,
        slotReleasePolicy: new OIMSlotReleasePolicyAfterIdle({ keepAfterIdleMs: WINDOW }),
    });
    const cards = cardsService.createStoreSlot(db);
    return {
        db,
        afterIdleReleaseSlotCollectorSlot: db.collectorSlot.afterIdleReleaseSlotCollectorSlot,
        cardsService,
        cards,
        at: (value: number): void => { ms = value; },
        isArmed: (): boolean => armed !== undefined,
    };
};

describe('stopping the release clock', () => {
    it('takes the timer down and leaves every identity that was on it exactly where it is', () => {
        const fixture =createFixtureAt();
        fixture.cardsService.slotContentService.upsertEntity(fixture.cards, { id: 'c1', title: 'one' });
        fixture.db.flush();
        expect(fixture.isArmed()).toBe(true);

        OIMReleaseSlotCollectorServiceAfterIdle.INSTANCE.cancelAllSlotReleases(fixture.afterIdleReleaseSlotCollectorSlot);

        expect(fixture.isArmed()).toBe(false);

        fixture.at(START + WINDOW + 1_000);
        OIMReleaseSlotCollectorServiceAfterIdle.INSTANCE.flush(fixture.afterIdleReleaseSlotCollectorSlot);

        expect(fixture.cardsService.getSlotByKey(fixture.cards, 'c1')?.entity).toEqual({ id: 'c1', title: 'one' });
        expect(fixture.cardsService.getSlotCount(fixture.cards)).toBe(1);
    });

    it('does not end the collector: a key filed afterwards is on the clock and goes at its deadline', () => {
        const fixture =createFixtureAt();
        fixture.cardsService.slotContentService.upsertEntity(fixture.cards, { id: 'c1', title: 'one' });
        fixture.db.flush();
        OIMReleaseSlotCollectorServiceAfterIdle.INSTANCE.cancelAllSlotReleases(fixture.afterIdleReleaseSlotCollectorSlot);

        const condemned = fixture.cardsService.slotContentService.upsertEntity(fixture.cards, { id: 'c2', title: 'two' });
        fixture.db.flush();

        expect(fixture.isArmed()).toBe(true);
        expect(OIMReleaseSlotQueueService.INSTANCE.isSlotReleaseScheduled(fixture.afterIdleReleaseSlotCollectorSlot, condemned)).toBe(true);

        fixture.at(START + WINDOW + 1_000);
        OIMReleaseSlotCollectorServiceAfterIdle.INSTANCE.flush(fixture.afterIdleReleaseSlotCollectorSlot);

        expect(oimIsSlotReleased(condemned)).toBe(true);
        expect(fixture.cardsService.getSlotCount(fixture.cards)).toBe(1);
        expect(fixture.cardsService.getSlotByKey(fixture.cards, 'c1')?.entity).toEqual({ id: 'c1', title: 'one' });
    });
});

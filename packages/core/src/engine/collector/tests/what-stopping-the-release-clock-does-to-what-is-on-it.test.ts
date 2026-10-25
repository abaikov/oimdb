import { OIMSlotAfterIdleReleasePolicy } from '../OIMSlotAfterIdleReleasePolicy';
import { oimMintAfterIdleSlotReleaseWheel } from '../utils/oimMintAfterIdleSlotReleaseWheel';
import { OIMDB } from '../../../factories/OIMDB';
import type { TOIMDisposer } from '../../schedule/types/TOIMDisposer';
import { oimIsSlotReleased } from '../../slot/utils/oimIsSlotReleased';
import { createOIMSlotContentEntityService } from '../../../factories/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../../factories/createOIMSlotCollectionService';

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
    const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard, string>(db), slotReleasePolicy: new OIMSlotAfterIdleReleasePolicy({ keepAfterIdleMs: WINDOW }) });
    const cards = cardsService.createStoreSlot(db);
    return {
        db,
        afterIdleSlotReleaseWheel: oimMintAfterIdleSlotReleaseWheel(db.collectorSlot),
        cardsService,
        cards,
        at: (value: number): void => { ms = value; },
        isArmed: (): boolean => armed !== undefined,
    };
};

describe('stopping the release clock', () => {
    it('takes the timer down and leaves every identity that was on it exactly where it is', () => {
        const fixture =createFixtureAt();
        fixture.cardsService.writeSlotContentByKey(fixture.cards, 'c1', { id: 'c1', title: 'one' });
        fixture.db.flush();
        expect(fixture.isArmed()).toBe(true);

        fixture.afterIdleSlotReleaseWheel.cancelAllSlots();

        expect(fixture.isArmed()).toBe(false);

        fixture.at(START + WINDOW + 1_000);
        fixture.afterIdleSlotReleaseWheel.flush();

        expect(fixture.cardsService.getSlotByKey(fixture.cards, 'c1')?.entity).toEqual({ id: 'c1', title: 'one' });
        expect(fixture.cardsService.getSlotCount(fixture.cards)).toBe(1);
    });

    it('does not end the collector: a key filed afterwards is on the clock and goes at its deadline', () => {
        const fixture =createFixtureAt();
        fixture.cardsService.writeSlotContentByKey(fixture.cards, 'c1', { id: 'c1', title: 'one' });
        fixture.db.flush();
        fixture.afterIdleSlotReleaseWheel.cancelAllSlots();

        const condemned = fixture.cardsService.writeSlotContentByKey(fixture.cards, 'c2', { id: 'c2', title: 'two' });
        fixture.db.flush();

        expect(fixture.isArmed()).toBe(true);
        expect(fixture.afterIdleSlotReleaseWheel.isSlotReleaseScheduled(condemned)).toBe(true);

        fixture.at(START + WINDOW + 1_000);
        fixture.afterIdleSlotReleaseWheel.flush();

        expect(oimIsSlotReleased(condemned)).toBe(true);
        expect(fixture.cardsService.getSlotCount(fixture.cards)).toBe(1);
        expect(fixture.cardsService.getSlotByKey(fixture.cards, 'c1')?.entity).toEqual({ id: 'c1', title: 'one' });
    });
});

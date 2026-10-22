import {
    OIMDB,
    OIMEffectService,
    OIMReleaseSlotCollectorServiceAfterWrite,
    OIMSlotReleasePolicyAfterWrite,
    createOIMEntityService,
} from '../../../index';
import type { TOIMDisposer } from '../../../index';

type TCard = { id: string; title: string };

const START = 1_000_000;
/** Far above what one sweep of one identity reads, far below "for ever". */
const READS_ONE_SWEEP_MAY_TAKE = 200;

/** A clock that refuses to be read for ever, so a spin fails instead of hanging. */
const countingClock = () => {
    let ms = START;
    let reads = 0;
    return {
        now: (): number => {
            if (++reads > READS_ONE_SWEEP_MAY_TAKE) {
                throw new Error(
                    `the sweep read the clock ${reads} times for one identity: it is walking its own re-files`,
                );
            }
            return ms;
        },
        at: (value: number): void => { ms = value; },
        resetReads: (): void => { reads = 0; },
    };
};

const flushAfterWrite = (db: OIMDB): void => {
    OIMReleaseSlotCollectorServiceAfterWrite.INSTANCE.flush(db.collectorSlot.afterWriteReleaseSlotCollectorSlot);
};

/** The inactivity window: a subscribed identity is re-filed rather than condemned. */
const inactiveWorld = (after: number) => {
    const clock = countingClock();
    const db = new OIMDB({ getNowMs: clock.now, releaseTimer: (): TOIMDisposer => () => undefined });
    const cardsService = createOIMEntityService<TCard>(db, {
        keyOf: card => card.id,
        slotReleasePolicy: new OIMSlotReleasePolicyAfterWrite({ keepAfterWriteMs: after }),
    });
    const cards = cardsService.createStoreSlot(db);
    return { db, cardsService, cards, clock };
};

/** The write-age window: a row written since it was filed is re-filed at its own age. */
const createAgingFixture = (after: number) => {
    const clock = countingClock();
    const db = new OIMDB({ getNowMs: clock.now, releaseTimer: (): TOIMDisposer => () => undefined });
    const cardsService = createOIMEntityService<TCard>(db, {
        keyOf: card => card.id,
        slotReleasePolicy: new OIMSlotReleasePolicyAfterWrite({ keepAfterWriteMs: after }),
    });
    const cards = cardsService.createStoreSlot(db);
    return { db, cardsService, cards, clock };
};

describe('a window shorter than one slice', () => {
    it('does not make the inactivity sweep walk its own re-files', () => {
        // 100ms, against a slice of 1024: everything this test files and re-files
        // lands in the same slice.
        const fixture =inactiveWorld(100);
        const slot = fixture.cardsService.slotContentService.upsertEntity(fixture.cards, { id: 'c1', title: 'one' });
        fixture.db.flush();
        // SUBSCRIBED, which is what makes the sweep keep it rather than condemn it.
        const watching = OIMEffectService.INSTANCE.createEffect(fixture.db, [slot], [], () => undefined);

        fixture.clock.at(START + 200);
        fixture.clock.resetReads();
        flushAfterWrite(fixture.db);

        expect(fixture.cardsService.getSlotByKey(fixture.cards, 'c1')).toBe(slot);
        OIMEffectService.INSTANCE.disposeEffect(watching);
    });

    it('does not make the write-age sweep walk its own re-files', () => {
        const fixture =createAgingFixture(100);
        fixture.cardsService.slotContentService.upsertEntity(fixture.cards, { id: 'c1', title: 'one' });
        fixture.db.flush();

        // Half the window old, so the sweep re-reads the stamp and files it again
        // — into the slice it is standing in.
        fixture.clock.at(START + 50);
        fixture.clock.resetReads();
        flushAfterWrite(fixture.db);

        expect(fixture.cardsService.getSlotByKey(fixture.cards, 'c1')?.entity).toEqual({ id: 'c1', title: 'one' });
    });
});

import {
    OIMChannelService,
    OIMDB,
    OIMEffectService,
    OIMReleaseSlotCollectorServiceAfterIdle,
    OIMSlotReleasePolicyAfterIdle,
    createOIMEntityService,
    oimIsSlotEmpty,
    oimIsSlotReleased,
} from '../../../index';
import type { TOIMDisposer } from '../../../index';

type TCard = { id: string; title: string };

const START = 1_000_000;

const createFixtureAt = (after: number) => {
    let ms = START;
    const db = new OIMDB({ getNowMs: () => ms, releaseTimer: (_run): TOIMDisposer => (): void => undefined });
    const cardsService = createOIMEntityService<TCard>(db, {
        keyOf: card => card.id,
        slotReleasePolicy: new OIMSlotReleasePolicyAfterIdle({ keepAfterIdleMs: after }),
    });
    const cards = cardsService.createStoreSlot(db);
    return {
        db,
        cardsService,
        cards,
        flushAfterIdle: (): void => {
            OIMReleaseSlotCollectorServiceAfterIdle.INSTANCE.flush(db.collectorSlot.afterIdleReleaseSlotCollectorSlot);
        },
        at: (value: number): void => { ms = value; },
    };
};

describe('an identity a sweep takes back', () => {
    it('takes its value and its place in the collection with it', () => {
        const fixture =createFixtureAt(30_000);
        const slot = fixture.cardsService.slotContentService.upsertEntity(fixture.cards, { id: 'c1', title: 'one' });
        fixture.db.flush();
        expect(fixture.cardsService.getSlotCount(fixture.cards)).toBe(1);

        fixture.at(START + 31_000);
        fixture.flushAfterIdle();

        expect(oimIsSlotReleased(slot)).toBe(true);
        expect(fixture.cardsService.getSlotCount(fixture.cards)).toBe(0);
        expect(Array.from(fixture.cardsService.getSlots(fixture.cards))).not.toContain(slot);
        expect(oimIsSlotEmpty(slot)).toBe(true);
    });

    it('names the row at the door and nothing else, because its value left', () => {
        const fixture =createFixtureAt(30_000);
        const slot = fixture.cardsService.slotContentService.upsertEntity(fixture.cards, { id: 'c1', title: 'one' });
        fixture.db.flush();

        const writeWithoutFlushCheck = jest.spyOn(OIMChannelService.INSTANCE, 'writeWithoutFlushCheck');
        try {
            fixture.at(START + 31_000);
            fixture.flushAfterIdle();

            expect(writeWithoutFlushCheck.mock.calls.map(([, reported]) => reported)).toEqual([slot]);
        } finally {
            writeWithoutFlushCheck.mockRestore();
        }
    });

    it('still leaves an ordinary removal reporting once and not twice', () => {
        const fixture =createFixtureAt(30_000);
        const slot = fixture.cardsService.slotContentService.upsertEntity(fixture.cards, { id: 'c1', title: 'one' });
        fixture.db.flush();

        let runCount = 0;
        OIMEffectService.INSTANCE.createEffect(fixture.db, [slot], [], () => { runCount++; });

        fixture.cardsService.slotContentService.deleteEntity(slot);
        fixture.db.flush();

        expect(runCount).toBe(1);
    });

    it('still leaves an ordinary removal taking the place of a row nobody reads', () => {
        const fixture =createFixtureAt(30_000);
        const slot = fixture.cardsService.slotContentService.upsertEntity(fixture.cards, { id: 'c1', title: 'one' });
        fixture.db.flush();

        fixture.cardsService.slotContentService.deleteEntity(slot);
        fixture.db.flush();

        expect(oimIsSlotReleased(slot)).toBe(true);
        expect(fixture.cardsService.getSlotCount(fixture.cards)).toBe(0);
    });
});

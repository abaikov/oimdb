import { OIMChannelService, OIMDB, OIMEffectService, OIMSlotAfterIdleReleasePolicy, oimMintAfterIdleSlotReleaseWheel, oimIsSlotEmpty, oimIsSlotReleased } from '../../../index';
import type { TOIMDisposer } from '../../../index';
import { createOIMSlotContentEntityService } from '../../../factories/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../../factories/createOIMSlotCollectionService';

type TCard = { id: string; title: string };

const START = 1_000_000;

const createFixtureAt = (after: number) => {
    let ms = START;
    const db = new OIMDB({ getNowMs: () => ms, releaseTimer: (_run): TOIMDisposer => (): void => undefined });
    const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard, string>(db), slotReleasePolicy: new OIMSlotAfterIdleReleasePolicy({ keepAfterIdleMs: after }) });
    const cards = cardsService.createStoreSlot(db);
    return {
        db,
        cardsService,
        cards,
        flushAfterIdle: (): void => {
            oimMintAfterIdleSlotReleaseWheel(db.collectorSlot).flush();
        },
        at: (value: number): void => { ms = value; },
    };
};

describe('an identity a sweep takes back', () => {
    it('takes its value and its place in the collection with it', () => {
        const fixture =createFixtureAt(30_000);
        const slot = fixture.cardsService.writeSlotContentByKey(fixture.cards, 'c1', { id: 'c1', title: 'one' });
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
        const slot = fixture.cardsService.writeSlotContentByKey(fixture.cards, 'c1', { id: 'c1', title: 'one' });
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
        const slot = fixture.cardsService.writeSlotContentByKey(fixture.cards, 'c1', { id: 'c1', title: 'one' });
        fixture.db.flush();

        let runCount = 0;
        OIMEffectService.INSTANCE.createEffect(fixture.db, [slot], [], () => { runCount++; });

        fixture.cardsService.slotContentService.clearSlotContent(slot);
        fixture.db.flush();

        expect(runCount).toBe(1);
    });

    it('still leaves an ordinary removal taking the place of a row nobody reads', () => {
        const fixture =createFixtureAt(30_000);
        const slot = fixture.cardsService.writeSlotContentByKey(fixture.cards, 'c1', { id: 'c1', title: 'one' });
        fixture.db.flush();

        fixture.cardsService.slotContentService.clearSlotContent(slot);
        fixture.db.flush();

        expect(oimIsSlotReleased(slot)).toBe(true);
        expect(fixture.cardsService.getSlotCount(fixture.cards)).toBe(0);
    });
});

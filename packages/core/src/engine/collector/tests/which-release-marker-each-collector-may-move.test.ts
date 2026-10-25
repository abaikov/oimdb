import { OIMSlotAfterIdleReleasePolicy } from '../OIMSlotAfterIdleReleasePolicy';
import { oimMintAfterIdleSlotReleaseWheel } from '../utils/oimMintAfterIdleSlotReleaseWheel';
import { oimMintAfterWriteSlotReleaseWheel } from '../utils/oimMintAfterWriteSlotReleaseWheel';
import { OIMSlotAfterWriteReleasePolicy } from '../OIMSlotAfterWriteReleasePolicy';
import { OIMSlotEarliestReleasePolicy } from '../OIMSlotEarliestReleasePolicy';
import { OIMDB, OIMEffectService, oimIsSlotReleased } from '../../../index';
import { createOIMSlotContentEntityService } from '../../../factories/createOIMSlotContentEntityService';
import { createOIMSlotCollectionService } from '../../../factories/createOIMSlotCollectionService';

const DO_NOT_EDIT_TO_MAKE_IT_PASS = 'DO NOT EDIT TO MAKE IT PASS';

type TCard = { id: string; title: string };

const START = 1_000_000;

const createFixtureWith = (keepAfterIdleMs: number, keepAfterWriteMs: number) => {
    let ms = START;
    const db = new OIMDB({ getNowMs: () => ms, releaseTimer: () => () => undefined });
    const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard, string>(db), slotReleasePolicy: new OIMSlotEarliestReleasePolicy([
            new OIMSlotAfterWriteReleasePolicy({ keepAfterWriteMs }),
            new OIMSlotAfterIdleReleasePolicy({ keepAfterIdleMs }),
        ]) });
    const cards = cardsService.createStoreSlot(db);
    const afterIdleSlotReleaseWheel = oimMintAfterIdleSlotReleaseWheel(db.collectorSlot);
    const afterWriteSlotReleaseWheel = oimMintAfterWriteSlotReleaseWheel(db.collectorSlot);
    return {
        db,
        cardsService,
        cards,
        afterIdleSlotReleaseWheel,
        afterWriteSlotReleaseWheel,
        at: (value: number): void => { ms = value; },
        flushAfterIdle: (): void => { afterIdleSlotReleaseWheel.flush(); },
        flushAfterWrite: (): void => { afterWriteSlotReleaseWheel.flush(); },
        collect: (): void => {
            afterIdleSlotReleaseWheel.flush();
            afterWriteSlotReleaseWheel.flush();
        },
    };
};

const watched = (fixture:ReturnType<typeof createFixtureWith>, card: TCard) => {
    const slot = fixture.cardsService.writeSlotContentByKey(fixture.cards, card.id, card);
    fixture.db.flush();
    return { slot, effect: OIMEffectService.INSTANCE.createEffect(fixture.db, [slot], [], () => undefined) };
};

const updateByKey = (fixture:ReturnType<typeof createFixtureWith>, key: string, patch: Partial<TCard>): void => {
    const slot = fixture.cardsService.findSlotByKey(fixture.cards, key);
    if (slot !== undefined) fixture.cardsService.slotContentService.updateEntity(slot, patch);
};

describe(`each policy moves one marker and never the other — ${DO_NOT_EDIT_TO_MAKE_IT_PASS}`, () => {
    it('a write moves the write deadline and leaves the idle one where it stood', () => {
        const fixture =createFixtureWith(20_000, 60_000);
        const held = watched(fixture,{ id: 'c1', title: 'one' });
        fixture.at(START + 30_000);
        OIMEffectService.INSTANCE.disposeEffect(held.effect);
        const idleDueMs = fixture.cardsService.getSlotByKey(fixture.cards, 'c1').releaseDueAfterIdleMs;

        fixture.at(START + 40_000);
        updateByKey(fixture, 'c1', { title: 'two' });
        fixture.db.flush();

        const slot = fixture.cardsService.getSlotByKey(fixture.cards, 'c1');
        expect(slot.releaseDueAfterWriteMs).toBe(START + 40_000 + 60_000);
        expect(slot.releaseDueAfterIdleMs).toBe(idleDueMs);
    });

    it('the last subscriber leaving moves the idle deadline and leaves the write one', () => {
        const fixture =createFixtureWith(20_000, 60_000);
        const held = watched(fixture,{ id: 'c1', title: 'one' });
        const writeDueMs = fixture.cardsService.getSlotByKey(fixture.cards, 'c1').releaseDueAfterWriteMs;

        fixture.at(START + 30_000);
        OIMEffectService.INSTANCE.disposeEffect(held.effect);

        const slot = fixture.cardsService.getSlotByKey(fixture.cards, 'c1');
        expect(slot.releaseDueAfterIdleMs).toBe(START + 30_000 + 20_000);
        expect(slot.releaseDueAfterWriteMs).toBe(writeDueMs);
    });
});

describe(`the conflict one marker cannot hold — ${DO_NOT_EDIT_TO_MAKE_IT_PASS}`, () => {
    it('goes on its idle deadline at +50s, which a write at +40s saying +100s does not extend', () => {
        const fixture =createFixtureWith(20_000, 60_000);
        const held = watched(fixture,{ id: 'c1', title: 'one' });
        fixture.at(START + 30_000);
        OIMEffectService.INSTANCE.disposeEffect(held.effect);

        fixture.at(START + 40_000);
        updateByKey(fixture, 'c1', { title: 'two' });
        fixture.db.flush();

        fixture.at(START + 51_000);
        fixture.collect();

        expect(oimIsSlotReleased(held.slot)).toBe(true);
        expect(fixture.cardsService.getSlotCount(fixture.cards)).toBe(0);
    });

    it('goes on its write deadline at +25s, which a subscriber leaving at +10s saying +70s does not extend', () => {
        const fixture =createFixtureWith(60_000, 20_000);
        const held = watched(fixture,{ id: 'c1', title: 'one' });

        fixture.at(START + 5_000);
        updateByKey(fixture, 'c1', { title: 'two' });
        fixture.db.flush();

        fixture.at(START + 10_000);
        OIMEffectService.INSTANCE.disposeEffect(held.effect);

        fixture.at(START + 26_000);
        fixture.collect();

        expect(oimIsSlotReleased(held.slot)).toBe(true);
        expect(fixture.cardsService.getSlotCount(fixture.cards)).toBe(0);
    });
});

describe(`two collectors, two queues, nothing shared — ${DO_NOT_EDIT_TO_MAKE_IT_PASS}`, () => {
    it('are two queues, and one filing lands in both at two different slices', () => {
        const fixture =createFixtureWith(20_000, 60_000);
        fixture.cardsService.writeSlotContentByKey(fixture.cards, 'c1', { id: 'c1', title: 'one' });
        fixture.db.flush();
        const slot = fixture.cardsService.getSlotByKey(fixture.cards, 'c1');

        expect(fixture.afterIdleSlotReleaseWheel).not.toBe(fixture.afterWriteSlotReleaseWheel);
        expect((fixture.afterIdleSlotReleaseWheel as unknown as { slotsBySliceNumber: unknown }).slotsBySliceNumber)
            .not.toBe((fixture.afterWriteSlotReleaseWheel as unknown as { slotsBySliceNumber: unknown }).slotsBySliceNumber);
        expect(fixture.afterIdleSlotReleaseWheel.isSlotReleaseScheduled(slot)).toBe(true);
        expect(fixture.afterWriteSlotReleaseWheel.isSlotReleaseScheduled(slot)).toBe(true);
        expect(fixture.afterIdleSlotReleaseWheel.getNextSliceNumber())
            .toBeLessThan(fixture.afterWriteSlotReleaseWheel.getNextSliceNumber() as number);
    });

    it('stopping one leaves what the other is holding', () => {
        const fixture =createFixtureWith(20_000, 60_000);
        fixture.cardsService.writeSlotContentByKey(fixture.cards, 'c1', { id: 'c1', title: 'one' });
        fixture.db.flush();
        const slot = fixture.cardsService.getSlotByKey(fixture.cards, 'c1');

        fixture.afterIdleSlotReleaseWheel.cancelAllSlots();

        expect(fixture.afterIdleSlotReleaseWheel.isSlotReleaseScheduled(slot)).toBe(false);
        expect(fixture.afterWriteSlotReleaseWheel.isSlotReleaseScheduled(slot)).toBe(true);
    });

    it('sweeping the idle collector alone takes a row its idle window has run out on', () => {
        const fixture =createFixtureWith(20_000, 60_000);
        const slot = fixture.cardsService.writeSlotContentByKey(fixture.cards, 'c1', { id: 'c1', title: 'one' });
        fixture.db.flush();

        fixture.at(START + 21_000);
        fixture.flushAfterWrite();
        expect(fixture.cardsService.getSlotByKey(fixture.cards, 'c1')?.entity).toEqual({ id: 'c1', title: 'one' });

        fixture.flushAfterIdle();
        expect(oimIsSlotReleased(slot)).toBe(true);
        expect(fixture.cardsService.getSlotCount(fixture.cards)).toBe(0);
    });

    it('sweeping the write collector alone takes a row only its own window answers for', () => {
        const fixture =createFixtureWith(60_000, 20_000);
        const slot = fixture.cardsService.writeSlotContentByKey(fixture.cards, 'c1', { id: 'c1', title: 'one' });
        fixture.db.flush();

        fixture.at(START + 21_000);
        fixture.flushAfterIdle();
        expect(fixture.cardsService.getSlotByKey(fixture.cards, 'c1')?.entity).toEqual({ id: 'c1', title: 'one' });

        fixture.flushAfterWrite();
        expect(oimIsSlotReleased(slot)).toBe(true);
        expect(fixture.cardsService.getSlotCount(fixture.cards)).toBe(0);
    });

    it('a collector whose marker was never stamped files nothing', () => {
        let ms = START;
        const db = new OIMDB({ getNowMs: () => ms, releaseTimer: () => () => undefined });
        const afterWriteSlotReleaseWheel = oimMintAfterWriteSlotReleaseWheel(db.collectorSlot);
        const cardsService = createOIMSlotCollectionService(db, { slotContentService: createOIMSlotContentEntityService<TCard, string>(db), slotReleasePolicy: new OIMSlotAfterIdleReleasePolicy({ keepAfterIdleMs: 60_000 }) });
        const cards = cardsService.createStoreSlot(db);
        cardsService.writeSlotContentByKey(cards, 'c1', { id: 'c1', title: 'one' });
        db.flush();

        expect(cardsService.getSlotByKey(cards, 'c1').releaseDueAfterWriteMs).toBe(-1);
        expect(afterWriteSlotReleaseWheel.getNextSliceNumber()).toBeUndefined();

        ms = START + 10_000_000;
        afterWriteSlotReleaseWheel.flush();
        expect(cardsService.getSlotByKey(cards, 'c1')?.entity).toEqual({ id: 'c1', title: 'one' });
    });
});

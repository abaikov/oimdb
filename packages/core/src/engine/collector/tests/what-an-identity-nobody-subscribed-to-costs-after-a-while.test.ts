import {
    OIMDB,
    OIMEffectService,
    OIMReleaseSlotCollectorServiceAfterIdle,
    OIMReleaseSlotCollectorServiceAfterWrite,
    OIMSlotReleasePolicyAfterIdle,
    OIMSlotReleasePolicyAfterWrite,
    createOIMEntityService,
    oimIsSlotReleased,
} from '../../../index';
import type { TOIMDisposer } from '../../../index';

type TCard = { id: string; title: string };

const createFixtureAt = (after: number) => {
    let ms = 1_000_000;
    let armed: (() => void) | undefined;
    const db = new OIMDB({
        getNowMs: () => ms,
        releaseTimer: (run): TOIMDisposer => { armed = run; return () => { armed = undefined; }; },
    });
    const cardsService = createOIMEntityService<TCard>(db, {
        keyOf: card => card.id,
        slotReleasePolicy: new OIMSlotReleasePolicyAfterIdle({ keepAfterIdleMs: after }),
    });
    const cards = cardsService.createStoreSlot(db);
    return {
        db,
        flushAfterIdle: (): void => {
            OIMReleaseSlotCollectorServiceAfterIdle.INSTANCE.flush(db.collectorSlot.afterIdleReleaseSlotCollectorSlot);
        },
        cardsService,
        cards,
        at: (value: number): void => { ms = value; },
        fire: (): void => { const run = armed; armed = undefined; run?.(); },
        isArmed: (): boolean => armed !== undefined,
    };
};

describe('an identity nothing subscribed to', () => {
    it('is taken back once it has been inactive for the whole window', () => {
        const fixture =createFixtureAt(30_000);
        const slot = fixture.cardsService.slotContentService.upsertEntity(fixture.cards, { id: 'c1', title: 'one' });
        fixture.db.flush();
        expect(fixture.cardsService.getSlotByKey(fixture.cards, 'c1')?.entity).toEqual({ id: 'c1', title: 'one' });

        fixture.at(1_000_000 + 31_000);
        fixture.flushAfterIdle();

        expect(oimIsSlotReleased(slot)).toBe(true);
        expect(fixture.cardsService.getSlotCount(fixture.cards)).toBe(0);
    });

    it('is left alone while the window has not passed', () => {
        const fixture =createFixtureAt(30_000);
        fixture.cardsService.slotContentService.upsertEntity(fixture.cards, { id: 'c1', title: 'one' });
        fixture.db.flush();

        fixture.at(1_000_000 + 10_000);
        fixture.flushAfterIdle();

        expect(fixture.cardsService.getSlotByKey(fixture.cards, 'c1')?.entity).toEqual({ id: 'c1', title: 'one' });
    });
});

describe('what a subscriber does to the clock', () => {
    it('gives it a WHOLE NEW window rather than deferring the old one', () => {
        const fixture =createFixtureAt(30_000);
        const slot = fixture.cardsService.slotContentService.upsertEntity(fixture.cards, { id: 'c1', title: 'one' });
        fixture.db.flush();
        const effect = OIMEffectService.INSTANCE.createEffect(fixture.db, [slot], [], () => undefined);

        fixture.at(1_000_000 + 31_000);
        fixture.flushAfterIdle();
        expect(fixture.cardsService.getSlotByKey(fixture.cards, 'c1')?.entity).toEqual({ id: 'c1', title: 'one' });

        OIMEffectService.INSTANCE.disposeEffect(effect);
        expect(fixture.cardsService.getSlotByKey(fixture.cards, 'c1')?.entity).toEqual({ id: 'c1', title: 'one' });

        fixture.at(1_000_000 + 31_000 + 31_000);
        fixture.flushAfterIdle();
        expect(oimIsSlotReleased(slot)).toBe(true);
    });
});

describe('what a hold does', () => {
    it('blocks the clear as well as the removal', () => {
        const fixture =createFixtureAt(30_000);
        const slot = fixture.cardsService.slotContentService.upsertEntity(fixture.cards, { id: 'c1', title: 'one' });
        fixture.db.flush();
        slot.owner.holdSlot(slot);

        fixture.at(1_000_000 + 31_000);
        fixture.flushAfterIdle();

        expect(fixture.cardsService.getSlotByKey(fixture.cards, 'c1')?.entity).toEqual({ id: 'c1', title: 'one' });

        // AND THE GIVE-BACK FINISHES IT, because the window ran out while it was
        // held: a hold does not restart the clock, it only defers the verdict.
        slot.owner.unholdSlot(slot);
        expect(oimIsSlotReleased(slot)).toBe(true);
    });
});

describe('the other window, which counts from the last write', () => {
    const createAgingFixture = (after: number) => {
        let ms = 1_000_000;
        const db = new OIMDB({ getNowMs: () => ms, releaseTimer: () => () => undefined });
        const cardsService = createOIMEntityService<TCard>(db, {
            keyOf: card => card.id,
            slotReleasePolicy: new OIMSlotReleasePolicyAfterWrite({ keepAfterWriteMs: after }),
        });
        const cards = cardsService.createStoreSlot(db);
        return {
            db,
            flushAfterWrite: (): void => {
                OIMReleaseSlotCollectorServiceAfterWrite.INSTANCE.flush(db.collectorSlot.afterWriteReleaseSlotCollectorSlot);
            },
            cardsService,
            cards,
            at: (v: number): void => { ms = v; },
        };
    };

    it('ANY update puts the identity back at the far end of it', () => {
        const fixture =createAgingFixture(30_000);
        fixture.cardsService.slotContentService.upsertEntity(fixture.cards, { id: 'c1', title: 'one' });
        fixture.db.flush();

        fixture.at(1_000_000 + 20_000);
        const slot = fixture.cardsService.getSlotByKey(fixture.cards, 'c1');
        fixture.cardsService.slotContentService.updateEntity(slot, { title: 'two' });
        fixture.db.flush();

        fixture.at(1_000_000 + 31_000);
        fixture.flushAfterWrite();
        expect(fixture.cardsService.getSlotByKey(fixture.cards, 'c1')?.entity).toEqual({ id: 'c1', title: 'two' });

        fixture.at(1_000_000 + 20_000 + 31_000);
        fixture.flushAfterWrite();
        expect(oimIsSlotReleased(slot)).toBe(true);
    });

    it('a subscriber does not renew it, and does not lose it mid-read either', () => {
        const fixture =createAgingFixture(30_000);
        const slot = fixture.cardsService.slotContentService.upsertEntity(fixture.cards, { id: 'c1', title: 'one' });
        fixture.db.flush();
        const effect = OIMEffectService.INSTANCE.createEffect(fixture.db, [slot], [], () => undefined);

        fixture.at(1_000_000 + 31_000);
        fixture.flushAfterWrite();
        expect(fixture.cardsService.getSlotByKey(fixture.cards, 'c1')?.entity).toEqual({ id: 'c1', title: 'one' });

        OIMEffectService.INSTANCE.disposeEffect(effect);
        expect(oimIsSlotReleased(slot)).toBe(true);
    });
});

describe('the timer', () => {
    it('is not armed while there is nothing on the clock', () => {
        const fixture =createFixtureAt(30_000);
        expect(fixture.isArmed()).toBe(false);

        fixture.cardsService.slotContentService.upsertEntity(fixture.cards, { id: 'c1', title: 'one' });
        fixture.db.flush();
        expect(fixture.isArmed()).toBe(true);

        fixture.at(1_000_000 + 31_000);
        fixture.fire();
        expect(fixture.cardsService.getSlotCount(fixture.cards)).toBe(0);
        expect(fixture.isArmed()).toBe(false);
    });
});

describe('a collection built without the layer', () => {
    it('holds what it held before the layer existed', () => {
        const db = new OIMDB();
        const cardsService = createOIMEntityService<TCard>(db, { keyOf: card => card.id });
        const cards = cardsService.createStoreSlot(db);
        cardsService.slotContentService.upsertEntity(cards, { id: 'c1', title: 'one' });
        db.flush();
        expect(cardsService.getSlotByKey(cards, 'c1')?.entity).toEqual({ id: 'c1', title: 'one' });
    });
});

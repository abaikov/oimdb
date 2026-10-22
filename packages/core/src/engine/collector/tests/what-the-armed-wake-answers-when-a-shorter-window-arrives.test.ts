import {
    OIMDB,
    OIMReleaseSlotCollectorServiceAfterIdle,
    OIMSlotReleasePolicyAfterIdle,
    createOIMEntityService,
} from '../../../index';

type TCard = { id: string; title: string };

const START = 1_000_000;

const worldWithTwoWindows = (longMs: number, shortMs: number) => {
    let ms = START;
    const armedFor: number[] = [];
    const db = new OIMDB({
        getNowMs: () => ms,
        releaseTimer: (_wokeUp, delayMs) => {
            armedFor.push(delayMs);
            return () => { armedFor.splice(armedFor.indexOf(delayMs), 1); };
        },
    });
    const entityServiceWith = (keepAfterIdleMs: number) => createOIMEntityService<TCard>(db, {
        keyOf: card => card.id,
        slotReleasePolicy: new OIMSlotReleasePolicyAfterIdle({ keepAfterIdleMs }),
    });
    const archiveService = entityServiceWith(longMs);
    const liveService = entityServiceWith(shortMs);
    return {
        db,
        armedFor,
        archiveService,
        archive: archiveService.createStoreSlot(db),
        liveService,
        live: liveService.createStoreSlot(db),
        at: (value: number): void => { ms = value; },
        collect: (): void => {
            OIMReleaseSlotCollectorServiceAfterIdle.INSTANCE.flush(db.collectorSlot.afterIdleReleaseSlotCollectorSlot);
        },
    };
};

describe('an armed wake and a window shorter than the one it was armed for', () => {
    it('is re-armed for the shorter window, so the earlier deadline is the one it answers', () => {
        const world = worldWithTwoWindows(600_000, 1_000);

        world.archiveService.slotContentService.upsertEntity(world.archive, { id: 'a', title: 'A' });
        expect(world.armedFor).toHaveLength(1);
        expect(world.armedFor[0]).toBeGreaterThan(600_000);

        world.liveService.slotContentService.upsertEntity(world.live, { id: 'b', title: 'B' });

        expect(world.armedFor).toHaveLength(1);
        expect(world.armedFor[0]).toBeLessThan(2_000);
    });

    it('lets the short-window identity go at its own deadline, not at the long one', () => {
        const world = worldWithTwoWindows(600_000, 1_000);
        world.archiveService.slotContentService.upsertEntity(world.archive, { id: 'a', title: 'A' });
        world.liveService.slotContentService.upsertEntity(world.live, { id: 'b', title: 'B' });
        world.db.flush();
        expect(world.liveService.getSlotCount(world.live)).toBe(1);
        expect(world.archiveService.getSlotCount(world.archive)).toBe(1);

        world.at(START + 2_000);
        world.collect();

        expect(world.liveService.getSlotCount(world.live)).toBe(0);
        expect(world.archiveService.getSlotCount(world.archive)).toBe(1);
    });

    it('keeps the wake it has when the window that arrives is longer', () => {
        const world = worldWithTwoWindows(600_000, 1_000);

        world.liveService.slotContentService.upsertEntity(world.live, { id: 'b', title: 'B' });
        expect(world.armedFor).toHaveLength(1);
        const armedForTheShortWindow = world.armedFor[0];
        expect(armedForTheShortWindow).toBeLessThan(2_000);

        world.archiveService.slotContentService.upsertEntity(world.archive, { id: 'a', title: 'A' });

        expect(world.armedFor).toEqual([armedForTheShortWindow]);
    });
});

import { OIMDB, OIMReleaseSlotCollectorServiceAfterIdle, OIMSlotReleasePolicyAfterIdle } from '@oimdb/core';
import { createTestEntityCollection } from './shared/createTestEntityCollection';

type TCard = { id: string; title: string };

const buildWorld = (keepAfterIdleMs: number) => {
    let nowMs = 1_000_000;
    const db = new OIMDB({ getNowMs: () => nowMs, releaseTimer: () => () => undefined });
    const reportedKeys: string[] = [];
    const { entityCollectionService, entityStoreSlot, persistEntityWriter } = createTestEntityCollection<TCard>({
        db,
        slotReleasePolicy: new OIMSlotReleasePolicyAfterIdle({ keepAfterIdleMs }),
    });
    const disposer = persistEntityWriter.subscribeEntitySlotWritten(entitySlot => { reportedKeys.push(String(entitySlot.key)); });
    return {
        flushAfterIdleReleaseSlotCollector: (): void => {
            OIMReleaseSlotCollectorServiceAfterIdle.INSTANCE.flush(db.collectorSlot.afterIdleReleaseSlotCollectorSlot);
        },
        entityCollectionService,
        entityStoreSlot,
        reportedKeys,
        disposer,
        moveClockTo: (nextNowMs: number): void => { nowMs = nextNowMs; },
    };
};

describe('an entity persisted through the write-driven arm', () => {
    it('is collected on its window, exactly as an unpersisted one is', () => {
        const world = buildWorld(30_000);
        world.entityCollectionService.slotContentService.upsertEntity(world.entityStoreSlot, { id: 'c1', title: 'one' });
        expect(world.entityCollectionService.slotContentService.findEntityByKey(world.entityStoreSlot, 'c1'))
            .toEqual({ id: 'c1', title: 'one' });
        expect(world.reportedKeys).toEqual(['c1']);

        world.moveClockTo(1_000_000 + 31_000);
        world.flushAfterIdleReleaseSlotCollector();

        expect(world.entityCollectionService.getSlotCount(world.entityStoreSlot)).toBe(0);
        world.disposer();
    });

    it('reports the key when it goes, because a sync says the same thing in both places', () => {
        const world = buildWorld(30_000);
        world.entityCollectionService.slotContentService.upsertEntity(world.entityStoreSlot, { id: 'c1', title: 'one' });
        world.reportedKeys.length = 0;

        world.moveClockTo(1_000_000 + 31_000);
        world.flushAfterIdleReleaseSlotCollector();

        expect(world.reportedKeys).toEqual(['c1']);
        world.disposer();
    });

    it('renews nothing by passing through the persist entity writer: the writer takes no reference', () => {
        const world = buildWorld(30_000);
        const entitySlot = world.entityCollectionService.slotContentService.upsertEntity(
            world.entityStoreSlot, { id: 'c1', title: 'one' },
        );
        expect(entitySlot.holdCount).toBe(0);
        expect(entitySlot.effects).toBeUndefined();
        world.disposer();
    });
});

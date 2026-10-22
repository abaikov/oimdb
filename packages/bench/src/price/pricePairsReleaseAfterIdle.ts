import {
    OIMDB,
    OIMReleaseSlotCollectorServiceAfterIdle,
    OIMSlotReleasePolicyAfterIdle,
    OIMSlotStoreServiceMapDriven,
    createOIMEntityService,
} from '../../../core/src/index';
import type { TOIMColumnSlot, TOIMDisposer } from '../../../core/src/index';
import { EPricePath } from './EPricePath';
import { priceSink } from './priceSink';
import type { TPricePair } from './TPricePair';
import type { TPriceSide } from './TPriceSide';

type TIdleEntity = { readonly id: string; readonly title: string };

type TIdleClock = { nowMs: number };

const KEEP_AFTER_IDLE_MS = 30_000;

const STEP_PAST_WINDOW_MS = KEEP_AFTER_IDLE_MS * 2;

const idleEntitiesOf = (entityCount: number): TIdleEntity[] =>
    Array.from({ length: entityCount }, (_, at) => ({ id: `entity-${at}`, title: `title-${at & 7}` }));

const sideOfSweeps = (entitiesPerSweep: number, runSweep: (entityCount: number) => void): TPriceSide => {
    const side: TPriceSide = {
        reset: () => undefined,
        run: times => {
            let remaining = times;
            while (remaining >= entitiesPerSweep) {
                runSweep(entitiesPerSweep);
                remaining -= entitiesPerSweep;
            }
            if (remaining !== 0) runSweep(remaining);
        },
    };
    side.run(entitiesPerSweep * 64);
    return side;
};

const oursSide = (entitiesPerSweep: number, idleEntities: readonly TIdleEntity[]): TPriceSide => {
    const idleClock: TIdleClock = { nowMs: 1_000_000 };
    const db = new OIMDB({
        getNowMs: () => idleClock.nowMs,
        releaseTimer: (): TOIMDisposer => () => undefined,
    });
    const entityService = createOIMEntityService<TIdleEntity>(db, {
        keyOf: idleEntity => idleEntity.id,
        slotReleasePolicy: new OIMSlotReleasePolicyAfterIdle({ keepAfterIdleMs: KEEP_AFTER_IDLE_MS }),
        columnSlotStoreService: new OIMSlotStoreServiceMapDriven<TOIMColumnSlot>(),
    });
    const entityStoreSlot = entityService.createStoreSlot(db);
    const slotContentService = entityService.slotContentService;
    const afterIdleReleaseSlotCollectorSlot = db.collectorSlot.afterIdleReleaseSlotCollectorSlot;
    const runSweep = (entityCount: number): void => {
        for (let i = 0; i < entityCount; i++) priceSink.ours = slotContentService.upsertEntity(entityStoreSlot, idleEntities[i]);
        db.flush();
        idleClock.nowMs += STEP_PAST_WINDOW_MS;
        OIMReleaseSlotCollectorServiceAfterIdle.INSTANCE.flush(afterIdleReleaseSlotCollectorSlot);
    };
    runSweep(entitiesPerSweep);
    if (entityService.getSlotCount(entityStoreSlot) !== 0) {
        throw new Error(`price: release-after-idle kept ${entityService.getSlotCount(entityStoreSlot)} slots past their window.`);
    }
    return sideOfSweeps(entitiesPerSweep, runSweep);
};

const floorSide = (entitiesPerSweep: number, idleEntities: readonly TIdleEntity[]): TPriceSide => {
    const idleClock: TIdleClock = { nowMs: 1_000_000 };
    const entitiesByKey = new Map<string, TIdleEntity>();
    const queuedKeys: string[] = [];
    const queuedReleaseDueMs: number[] = [];
    let queueHead = 0;
    const runSweep = (entityCount: number): void => {
        for (let i = 0; i < entityCount; i++) {
            const idleEntity = idleEntities[i];
            entitiesByKey.set(idleEntity.id, idleEntity);
            queuedKeys.push(idleEntity.id);
            queuedReleaseDueMs.push(idleClock.nowMs + KEEP_AFTER_IDLE_MS);
        }
        idleClock.nowMs += STEP_PAST_WINDOW_MS;
        const nowMs = idleClock.nowMs;
        while (queueHead < queuedKeys.length && queuedReleaseDueMs[queueHead] <= nowMs) {
            entitiesByKey.delete(queuedKeys[queueHead]);
            queueHead++;
        }
        if (queueHead === queuedKeys.length && queueHead !== 0) {
            queuedKeys.length = 0;
            queuedReleaseDueMs.length = 0;
            queueHead = 0;
        }
        priceSink.number += entitiesByKey.size;
    };
    runSweep(entitiesPerSweep);
    if (entitiesByKey.size !== 0) throw new Error('price: the release-after-idle floor kept entities past their window.');
    return sideOfSweeps(entitiesPerSweep, runSweep);
};

const pairOf = (entitiesPerSweep: number): TPricePair => ({
    id: `release-after-idle.${entitiesPerSweep}-per-sweep`,
    path: EPricePath.PerRowPerWrite,
    ours: `entityService.slotContentService.upsertEntity(entityStoreSlot, entity) for ${entitiesPerSweep} new keys under OIMSlotReleasePolicyAfterIdle; `
        + 'db.flush(); the clock moved past the window; OIMReleaseSlotCollectorServiceAfterIdle.INSTANCE.flush(afterIdleReleaseSlotCollectorSlot)',
    floor: 'the same entities set into a Map, each key and its due time pushed onto a FIFO queue, the clock moved past '
        + 'the window, and the queue drained from its head deleting every due key from the Map',
    caveat: 'One operation is one entity inserted under a new key and later released when its idle window has passed; '
        + `the id names how many entities one sweep inserts before the clock jumps. Both sides read one fake clock that `
        + 'jumps by twice the window per sweep, so every entity is due at the sweep that follows its insert and none '
        + 'survives it; the collector timer is a no-op and the sweep is driven by OIMReleaseSlotCollectorServiceAfterIdle.INSTANCE.flush(). '
        + 'Ours mints a slot per insert, files it in the slot store, stamps it on the channel, records its due time on '
        + 'the slot and files it in a slice Set of the release queue with a Map entry per slot, then flushes an empty '
        + 'channel frame; the sweep walks the due slices, asks the policy whether each slot is releasable and releases '
        + 'it through its owner, unfiling it from the store and from the queue Map. The floor keeps no slot, no '
        + 'channel and no per-key queue index: one FIFO is enough for it only because every key here shares one '
        + 'window, which the slice queue does not assume. All of that pushes the ratio up, against ours.',
    build: () => {
        const idleEntities = idleEntitiesOf(entitiesPerSweep);
        return {
            ours: oursSide(entitiesPerSweep, idleEntities),
            floor: floorSide(entitiesPerSweep, idleEntities.map(idleEntity => ({ ...idleEntity }))),
        };
    },
});

export const pricePairsReleaseAfterIdle: readonly TPricePair[] = [1, 64, 1024].map(pairOf);

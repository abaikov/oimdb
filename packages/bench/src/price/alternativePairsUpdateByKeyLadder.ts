import { OIMChannelService, createOIMEntityWriterInPlace, oimSameValueZeroGuard } from '../../../core/src/index';
import { OIM_SLOT_FLAG_RELEASED } from '../../../core/src/engine/slot/constants/OIM_SLOT_FLAG_RELEASED';
import { EPricePath } from './EPricePath';
import { priceDataset } from './priceDataset';
import { priceFixture } from './priceFixture';
import { priceRoundSide } from './priceRoundSide';
import { priceCloseTrackedFrame, priceQueueOnce, priceTrackedFrame } from './priceTrackedFrame';
import type { TPriceTrackedFrame } from './priceTrackedFrame';
import type { TPricePair } from './TPricePair';
import type { TPriceSide } from './TPriceSide';

type TByKeyFixture = ReturnType<typeof priceFixture>;
type TByKeyRung = (fixture: TByKeyFixture, trackedFrame: TPriceTrackedFrame, title: string, upTo: number) => void;

const shippedWriter = createOIMEntityWriterInPlace();
const channelService = OIMChannelService.INSTANCE;

const bareMapStore: TByKeyRung = (fixture, _trackedFrame, title, upTo) => {
    const rows = fixture.rows;
    const byId = fixture.byId;
    for (let i = 0; i < upTo; i++) {
        const entity = byId.get(rows[i].id);
        if (entity !== undefined) entity.title = title;
    }
};

const trackedMapStore: TByKeyRung = (fixture, trackedFrame, title, upTo) => {
    const rows = fixture.rows;
    const byId = fixture.byId;
    for (let i = 0; i < upTo; i++) {
        const entity = byId.get(rows[i].id);
        if (entity === undefined || entity.title === title) continue;
        entity.title = title;
        priceQueueOnce(trackedFrame, i);
    }
};

const trackedSlotLookup: TByKeyRung = (fixture, trackedFrame, title, upTo) => {
    const rows = fixture.rows;
    const { entityService, entityStoreSlot } = fixture;
    for (let i = 0; i < upTo; i++) {
        const entity = entityService.getSlotByKey(entityStoreSlot, rows[i].id).entity;
        if (entity === undefined || entity.title === title) continue;
        entity.title = title;
        priceQueueOnce(trackedFrame, i);
    }
};

const sameValueZeroLookup: TByKeyRung = (fixture, trackedFrame, title, upTo) => {
    const rows = fixture.rows;
    const { entityService, entityStoreSlot } = fixture;
    for (let i = 0; i < upTo; i++) {
        const entity = entityService.getSlotByKey(entityStoreSlot, rows[i].id).entity as Record<string, unknown> | undefined;
        if (entity === undefined || oimSameValueZeroGuard(entity.title, title)) continue;
        entity.title = title;
        priceQueueOnce(trackedFrame, i);
    }
};

const writerColumn: TByKeyRung = (fixture, trackedFrame, title, upTo) => {
    const rows = fixture.rows;
    const { entityService, entityStoreSlot } = fixture;
    for (let i = 0; i < upTo; i++) {
        if (shippedWriter.patchColumn(entityService.getSlotByKey(entityStoreSlot, rows[i].id), 'title', title, undefined)) priceQueueOnce(trackedFrame, i);
    }
};

const writerColumnAndChannel: TByKeyRung = (fixture, _trackedFrame, title, upTo) => {
    const rows = fixture.rows;
    const { entityService, entityStoreSlot } = fixture;
    const channelSlot = fixture.db.defaultChannelSlot;
    for (let i = 0; i < upTo; i++) {
        const slot = entityService.getSlotByKey(entityStoreSlot, rows[i].id);
        if (shippedWriter.patchColumn(slot, 'title', title, undefined)) channelService.writeWithoutFlushCheck(channelSlot, slot);
    }
};

const handDoorChecks: TByKeyRung = (fixture, _trackedFrame, title, upTo) => {
    const rows = fixture.rows;
    const { entityService, entityStoreSlot } = fixture;
    const channelSlot = fixture.db.defaultChannelSlot;
    for (let i = 0; i < upTo; i++) {
        const slot = entityService.getSlotByKey(entityStoreSlot, rows[i].id);
        channelService.assertNotFlushing(channelSlot);
        if ((slot.slotFlags & OIM_SLOT_FLAG_RELEASED) !== 0) throw new Error('released');
        if (slot.columnSlotStore !== undefined) throw new Error('column readers');
        if (!shippedWriter.patchColumn(slot, 'title', title, undefined)) continue;
        channelService.writeWithoutFlushCheck(channelSlot, slot);
        slot.owner.releaseSlotIfUnheld(slot);
    }
};

const columnDoor: TByKeyRung = (fixture, _trackedFrame, title, upTo) => {
    const rows = fixture.rows;
    const { entityService, entityStoreSlot } = fixture;
    const slotContentService = entityService.slotContentService;
    for (let i = 0; i < upTo; i++) slotContentService.updateEntityColumn(entityService.getSlotByKey(entityStoreSlot, rows[i].id), 'title', title);
};

const patchDoor: TByKeyRung = (fixture, _trackedFrame, title, upTo) => {
    const rows = fixture.rows;
    const { entityService, entityStoreSlot } = fixture;
    const slotContentService = entityService.slotContentService;
    const patch = { title };
    for (let i = 0; i < upTo; i++) slotContentService.updateEntity(entityService.getSlotByKey(entityStoreSlot, rows[i].id), patch);
};

const compareWithoutRevision: TByKeyRung = (fixture, _trackedFrame, title, upTo) => {
    const rows = fixture.rows;
    const { entityService, entityStoreSlot } = fixture;
    const channelSlot = fixture.db.defaultChannelSlot;
    for (let i = 0; i < upTo; i++) {
        const slot = entityService.getSlotByKey(entityStoreSlot, rows[i].id);
        channelService.assertNotFlushing(channelSlot);
        if (!shippedWriter.patchColumn(slot, 'title', title, undefined)) continue;
        const effects = slot.effects;
        if (effects !== undefined && effects.length !== 0) channelService.writeWithoutFlushCheck(channelSlot, slot);
    }
};

const storeWhenUnwatched: TByKeyRung = (fixture, _trackedFrame, title, upTo) => {
    const rows = fixture.rows;
    const { entityService, entityStoreSlot } = fixture;
    const channelSlot = fixture.db.defaultChannelSlot;
    for (let i = 0; i < upTo; i++) {
        const slot = entityService.getSlotByKey(entityStoreSlot, rows[i].id);
        channelService.assertNotFlushing(channelSlot);
        const effects = slot.effects;
        if (effects === undefined || effects.length === 0) {
            (slot.entity as Record<string, unknown>).title = title;
            continue;
        }
        if (shippedWriter.patchColumn(slot, 'title', title, undefined)) channelService.writeWithoutFlushCheck(channelSlot, slot);
    }
};

const HAND_FRAME_RUNGS: readonly TByKeyRung[] = [bareMapStore, trackedMapStore, trackedSlotLookup, sameValueZeroLookup, writerColumn];

const byKeyRungSide = (rung: TByKeyRung): TPriceSide => {
    const fixture = priceFixture(priceDataset.batch);
    const trackedFrame = priceTrackedFrame(fixture.rows.length);
    const closeFrame = HAND_FRAME_RUNGS.includes(rung)
        ? () => priceCloseTrackedFrame(trackedFrame)
        : () => fixture.db.flush();
    return priceRoundSide(fixture.rows.length, (upTo, round) => {
        rung(fixture, trackedFrame, priceDataset.titles[round & 7], upTo);
    }, closeFrame);
};

const BY_KEY_LADDER =
    'One rung of a ladder from `map.get(id).title = value` to `entityService.updateEntityColumn(entityService.getSlotByKey(entityStoreSlot, id), \'title\', value)`. '
    + 'Every rung writes one column of the same priceDataset.batch entities, found by the same ids in the same order, in the same loop; '
    + 'each adds exactly one thing to the rung below it, and each pair re-measures the rung below as its floor in its own run. '
    + 'Up to the writer rung a frame is a hand-written stamp per entity and a queue drained once per round; from the channel rung on it is the shipped channel and its flush.';

const byKeyPair = (step: string, ours: TByKeyRung, oursText: string, floor: TByKeyRung, floorText: string, adds: string): TPricePair => ({
    id: `alt.ladder.update-by-key.${step}`,
    path: EPricePath.PerWrite,
    ours: oursText,
    floor: floorText,
    caveat: `${BY_KEY_LADDER} This rung adds: ${adds}`,
    build: () => ({ ours: byKeyRungSide(ours), floor: byKeyRungSide(floor) }),
});

const sharedFixtureRungSide = (rung: TByKeyRung, fixture: TByKeyFixture): TPriceSide => {
    const trackedFrame = priceTrackedFrame(fixture.rows.length);
    const closeFrame = HAND_FRAME_RUNGS.includes(rung)
        ? () => priceCloseTrackedFrame(trackedFrame)
        : () => fixture.db.flush();
    return priceRoundSide(fixture.rows.length, (upTo, round) => {
        rung(fixture, trackedFrame, priceDataset.titles[round & 7], upTo);
    }, closeFrame);
};

const catalogueShapeSides = (
    oursRound: (fixture: TByKeyFixture, upTo: number, title: string) => void,
): { ours: TPriceSide; floor: TPriceSide } => {
    const fixture = priceFixture(priceDataset.batch);
    return {
        ours: priceRoundSide(
            fixture.rows.length,
            (upTo, round) => oursRound(fixture, upTo, priceDataset.titles[round & 7]),
            () => fixture.db.flush(),
        ),
        floor: priceRoundSide(fixture.rows.length, (upTo, round) => {
            const rows = fixture.rows;
            const byId = fixture.byId;
            const title = priceDataset.titles[round & 7];
            for (let i = 0; i < upTo; i++) {
                const row = byId.get(rows[i].id);
                if (row !== undefined) row.title = title;
            }
        }),
    };
};

const moduleLevelOursRound = (fixture: TByKeyFixture, upTo: number, title: string): void => {
    const rows = fixture.rows;
    const { entityService, entityStoreSlot } = fixture;
    for (let i = 0; i < upTo; i++) entityService.slotContentService.updateEntityColumn(entityService.getSlotByKey(entityStoreSlot, rows[i].id), 'title', title);
};

const catalogueFloorRound = (fixture: TByKeyFixture, upTo: number, title: string): void => {
    const rows = fixture.rows;
    const byId = fixture.byId;
    for (let i = 0; i < upTo; i++) {
        const row = byId.get(rows[i].id);
        if (row !== undefined) row.title = title;
    }
};

const withFrameArraySides = (): { ours: TPriceSide; floor: TPriceSide } => {
    const fixture = priceFixture(priceDataset.batch);
    const trackedFrame = priceTrackedFrame(fixture.rows.length);
    return {
        ours: priceRoundSide(
            fixture.rows.length,
            (upTo, round) => { trackedFrame.frame = round; moduleLevelOursRound(fixture, upTo, priceDataset.titles[round & 7]); },
            () => fixture.db.flush(),
        ),
        floor: priceRoundSide(fixture.rows.length, (upTo, round) => catalogueFloorRound(fixture, upTo, priceDataset.titles[round & 7])),
    };
};

const ladderArgOrderRound = (fixture: TByKeyFixture, _trackedFrame: unknown, title: string, upTo: number): void => {
    const rows = fixture.rows;
    const { entityService, entityStoreSlot } = fixture;
    for (let i = 0; i < upTo; i++) entityService.slotContentService.updateEntityColumn(entityService.getSlotByKey(entityStoreSlot, rows[i].id), 'title', title);
};

const ladderArgOrderSides = (): { ours: TPriceSide; floor: TPriceSide } => {
    const fixture = priceFixture(priceDataset.batch);
    return {
        ours: priceRoundSide(
            fixture.rows.length,
            (upTo, round) => { ladderArgOrderRound(fixture, undefined, priceDataset.titles[round & 7], upTo); },
            () => fixture.db.flush(),
        ),
        floor: priceRoundSide(fixture.rows.length, (upTo, round) => catalogueFloorRound(fixture, upTo, priceDataset.titles[round & 7])),
    };
};

const sameFactorySide = (
    fixture: TByKeyFixture,
    round: (fixture: TByKeyFixture, upTo: number, title: string) => void,
): TPriceSide => priceRoundSide(fixture.rows.length, (upTo, index) => round(fixture, upTo, priceDataset.titles[index & 7]), () => fixture.db.flush());

const sameFactorySides = (): { ours: TPriceSide; floor: TPriceSide } => {
    const fixture = priceFixture(priceDataset.batch);
    return { ours: sameFactorySide(fixture, moduleLevelOursRound), floor: sameFactorySide(fixture, catalogueFloorRound) };
};

export const alternativePairsUpdateByKeyLadder: readonly TPricePair[] = [
    {
        id: 'alt.ladder.update-by-key.e1-catalogue-plus-frame-array',
        path: EPricePath.PerWrite,
        ours: 'the catalogue shape, plus an Int32Array frame allocated beside the fixture',
        floor: 'map.get(id).title = value',
        caveat: `${BY_KEY_LADDER} Only the frame array differs from 0d.`,
        build: withFrameArraySides,
    },
    {
        id: 'alt.ladder.update-by-key.e2-catalogue-ladder-arg-order',
        path: EPricePath.PerWrite,
        ours: 'the catalogue shape, the round called with the ladder\'s argument order',
        floor: 'map.get(id).title = value',
        caveat: `${BY_KEY_LADDER} Only the argument order differs from 0d.`,
        build: ladderArgOrderSides,
    },
    {
        id: 'alt.ladder.update-by-key.e3-catalogue-one-round-factory',
        path: EPricePath.PerWrite,
        ours: 'the catalogue shape, both sides built by one round factory',
        floor: 'map.get(id).title = value',
        caveat: `${BY_KEY_LADDER} Only the shared round factory differs from 0d.`,
        build: sameFactorySides,
    },
    {
        id: 'alt.ladder.update-by-key.0d-catalogue-module-level-round',
        path: EPricePath.PerWrite,
        ours: 'entityService.updateEntityColumn(entityService.getSlotByKey(entityStoreSlot, id), \'title\', value)',
        floor: 'map.get(id).title = value',
        caveat: `${BY_KEY_LADDER} The catalogue shape with the round body moved to a module-level function.`,
        build: () => catalogueShapeSides(moduleLevelOursRound),
    },
    byKeyPair('x1-no-revision-channel', compareWithoutRevision, 'getSlotByKey, flush guard, patchColumn (compares), channel only when the slot has effects — no clock tick, no stamp',
        bareMapStore, 'map.get(id).title = value',
        'what a channel with no computeds would leave: the comparison stays, the revision stamp goes.'),
    byKeyPair('x2-store-when-unwatched', storeWhenUnwatched, 'getSlotByKey, flush guard, and a plain store when the slot has no effects',
        bareMapStore, 'map.get(id).title = value',
        'what a collection with no computeds could do on an unwatched slot: no comparison, no stamp.'),
    byKeyPair('x0-column-door-now', columnDoor, 'entityService.updateEntityColumn(entityService.getSlotByKey(entityStoreSlot, id), \'title\', value)',
        bareMapStore, 'map.get(id).title = value',
        'the shipped column door today, in the same loop, for comparison.'),
    {
        id: 'alt.ladder.update-by-key.0c-catalogue-copy',
        path: EPricePath.PerWrite,
        ours: 'entityService.updateEntityColumn(entityService.getSlotByKey(entityStoreSlot, id), \'title\', value)',
        floor: 'map.get(id).title = value',
        caveat: `${BY_KEY_LADDER} The catalogue pair's body, copied verbatim.`,
        build: () => catalogueShapeSides((fixture, upTo, title) => {
            const rows = fixture.rows;
            const { entityService, entityStoreSlot } = fixture;
            for (let i = 0; i < upTo; i++) entityService.slotContentService.updateEntityColumn(entityService.getSlotByKey(entityStoreSlot, rows[i].id), 'title', title);
        }),
    },
    {
        id: 'alt.ladder.update-by-key.0b-column-door-one-fixture',
        path: EPricePath.PerWrite,
        ours: 'entityService.updateEntityColumn(entityService.getSlotByKey(entityStoreSlot, id), \'title\', value)',
        floor: 'map.get(id).title = value',
        caveat: `${BY_KEY_LADDER} Both sides share one fixture, as the catalogue pair does.`,
        build: () => {
            const fixture = priceFixture(priceDataset.batch);
            return { ours: sharedFixtureRungSide(columnDoor, fixture), floor: sharedFixtureRungSide(bareMapStore, fixture) };
        },
    },
    byKeyPair('0-column-door-vs-bare-map', columnDoor, 'entityService.updateEntityColumn(entityService.getSlotByKey(entityStoreSlot, id), \'title\', value)',
        bareMapStore, 'map.get(id).title = value',
        'the whole column door by key over a bare Map store, in this ladder\'s own loop.'),
    byKeyPair('1-compare-and-queue', trackedMapStore, 'map.get(id), skip when equal, store, queue once per frame',
        bareMapStore, 'map.get(id).title = value',
        'the comparison with the old value and the once-per-frame queue a bare Map store does not do.'),
    byKeyPair('2-engine-lookup', trackedSlotLookup, 'entityService.getSlotByKey(entityStoreSlot, id).entity, then the same compare, store and queue',
        trackedMapStore, 'map.get(id), skip when equal, store, queue once per frame',
        'finding the entity through the collection instead of a Map of entities.'),
    byKeyPair('3-same-value-zero', sameValueZeroLookup, 'the same with oimSameValueZeroGuard instead of ===',
        trackedSlotLookup, 'getSlotByKey, ===, store, queue',
        'the SameValueZero comparison the shipped writer uses.'),
    byKeyPair('4-writer-column', writerColumn, 'getSlotByKey, then the shipped writer\'s patchColumn, then the hand queue',
        sameValueZeroLookup, 'getSlotByKey, SameValueZero, store, queue — written inline',
        'the call through the shipped writer object: the __proto__ check and the store it does.'),
    byKeyPair('5-channel', writerColumnAndChannel, 'getSlotByKey, patchColumn, OIMChannelService.INSTANCE.writeWithoutFlushCheck; db.flush() per round',
        writerColumn, 'getSlotByKey, patchColumn, hand stamp and queue',
        'the shipped channel instead of a hand stamp and queue.'),
    byKeyPair('6-door-checks', handDoorChecks, 'the flush and released asserts, the column-slot check, patchColumn, the channel, releaseSlotIfUnheld',
        writerColumnAndChannel, 'getSlotByKey, patchColumn, the channel',
        'the checks the door runs around the write, written by hand. The releaseSlotIfUnheld here is a full check the shipped updateEntityColumn does not run by default: it calls releaseWrittenSlotIfUnheld, a no-op unless the release policy releases written slots.'),
    byKeyPair('7-column-door', columnDoor, 'entityService.updateEntityColumn(entityService.getSlotByKey(entityStoreSlot, id), \'title\', value)',
        handDoorChecks, 'the same steps written by hand',
        'the shipped door: entityService.slotContentService.updateEntityColumn → assertWritable, the isOnFastPath read, patchColumn, the channel and releaseWrittenSlotIfUnheld — not the full releaseSlotIfUnheld its floor runs.'),
    byKeyPair('8-patch-door', patchDoor, 'entityService.slotContentService.updateEntity(entityService.getSlotByKey(entityStoreSlot, id), { title }) — the patch door',
        columnDoor, 'entityService.updateEntityColumn(entityService.getSlotByKey(entityStoreSlot, id), \'title\', value)',
        'the patch object and the walk over it, instead of naming the column.'),
];

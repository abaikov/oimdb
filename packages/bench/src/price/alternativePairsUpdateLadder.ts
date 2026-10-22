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

type TLadderFixture = ReturnType<typeof priceFixture>;
type TTitlePatch = { title: string };
type TRung = (fixture: TLadderFixture, trackedFrame: TPriceTrackedFrame, patch: TTitlePatch, upTo: number) => void;

const directField: TRung = (fixture, trackedFrame, patch, upTo) => {
    const slots = fixture.slots;
    const title = patch.title;
    for (let i = 0; i < upTo; i++) {
        const entity = slots[i].entity as Record<string, unknown>;
        if (entity.title === title) continue;
        entity.title = title;
        priceQueueOnce(trackedFrame, i);
    }
};

const bareForIn: TRung = (fixture, trackedFrame, patch, upTo) => {
    const slots = fixture.slots;
    const source = patch as Record<string, unknown>;
    for (let i = 0; i < upTo; i++) {
        const entity = slots[i].entity as Record<string, unknown>;
        let isWritten = false;
        for (const name in source) {
            if (entity[name] === source[name]) continue;
            entity[name] = source[name];
            isWritten = true;
        }
        if (isWritten) priceQueueOnce(trackedFrame, i);
    }
};

const guardedForIn: TRung = (fixture, trackedFrame, patch, upTo) => {
    const slots = fixture.slots;
    const source = patch as Record<string, unknown>;
    for (let i = 0; i < upTo; i++) {
        const entity = slots[i].entity as Record<string, unknown>;
        let isWritten = false;
        for (const name in source) {
            if (name === '__proto__') continue;
            if (!Object.prototype.hasOwnProperty.call(source, name)) continue;
            if (oimSameValueZeroGuard(entity[name], source[name])) continue;
            entity[name] = source[name];
            isWritten = true;
        }
        if (isWritten) priceQueueOnce(trackedFrame, i);
    }
};

const shippedWriter = createOIMEntityWriterInPlace();
const channelService = OIMChannelService.INSTANCE;

const writerObject: TRung = (fixture, trackedFrame, patch, upTo) => {
    const slots = fixture.slots;
    for (let i = 0; i < upTo; i++) {
        if (shippedWriter.patchEntity(slots[i], patch, undefined)) priceQueueOnce(trackedFrame, i);
    }
};

type TLadderSlot = TLadderFixture['slots'][number];

const handDoorFields = { updatesEmptinessOnColumnWrite: false, contentChangeListeners: [] as unknown[] };

const assertHandWritable = (fixture: TLadderFixture, slot: TLadderSlot): void => {
    channelService.assertNotFlushing(fixture.db.defaultChannelSlot);
    if ((slot.slotFlags & OIM_SLOT_FLAG_RELEASED) !== 0) throw new Error('released');
};

const assertHandOneChannelWrite = (slot: TLadderSlot): void => {
    if (handDoorFields.updatesEmptinessOnColumnWrite
        || slot.columnSlotStore !== undefined
        || handDoorFields.contentChangeListeners.length !== 0) throw new Error('not one channel write');
};

const writeAndAnnounce = (fixture: TLadderFixture, slot: TLadderSlot, patch: TTitlePatch): boolean => {
    if (!shippedWriter.patchEntity(slot, patch, undefined)) return false;
    channelService.writeWithoutFlushCheck(fixture.db.defaultChannelSlot, slot);
    return true;
};

const writerAndChannel: TRung = (fixture, _trackedFrame, patch, upTo) => {
    const slots = fixture.slots;
    for (let i = 0; i < upTo; i++) writeAndAnnounce(fixture, slots[i], patch);
};

const withWriteAsserts: TRung = (fixture, _trackedFrame, patch, upTo) => {
    const slots = fixture.slots;
    for (let i = 0; i < upTo; i++) {
        assertHandWritable(fixture, slots[i]);
        writeAndAnnounce(fixture, slots[i], patch);
    }
};

const withColumnReaderCheck: TRung = (fixture, _trackedFrame, patch, upTo) => {
    const slots = fixture.slots;
    for (let i = 0; i < upTo; i++) {
        assertHandWritable(fixture, slots[i]);
        assertHandOneChannelWrite(slots[i]);
        writeAndAnnounce(fixture, slots[i], patch);
    }
};

const withReleaseCheck: TRung = (fixture, _trackedFrame, patch, upTo) => {
    const slots = fixture.slots;
    for (let i = 0; i < upTo; i++) {
        assertHandWritable(fixture, slots[i]);
        assertHandOneChannelWrite(slots[i]);
        if (writeAndAnnounce(fixture, slots[i], patch)) slots[i].owner.releaseSlotIfUnheld(slots[i]);
    }
};

const collectionDoor: TRung = (fixture, _trackedFrame, patch, upTo) => {
    const slots = fixture.slots;
    const slotContentService = fixture.entityService.slotContentService;
    for (let i = 0; i < upTo; i++) slotContentService.updateEntity(slots[i], patch);
};

const HAND_FRAME_RUNGS: readonly TRung[] = [directField, bareForIn, guardedForIn, writerObject];

const rungSide = (rung: TRung, fixture: TLadderFixture): TPriceSide => {
    const trackedFrame = priceTrackedFrame(fixture.slots.length);
    const patch: TTitlePatch = { title: '' };
    const closeFrame = HAND_FRAME_RUNGS.includes(rung)
        ? () => priceCloseTrackedFrame(trackedFrame)
        : () => fixture.db.flush();
    return priceRoundSide(fixture.slots.length, (upTo, round) => {
        patch.title = priceDataset.titles[round & 7];
        rung(fixture, trackedFrame, patch, upTo);
    }, closeFrame);
};

const LADDER =
    'One rung of a ladder from a hand-written tracked write (`entity.title = value` after `===`, the entity queued once per frame) '
    + 'to `entityService.updateEntity(slot, patch)`. Every rung writes the same slots of one population of priceDataset.batch entities, '
    + 'in the same loop, one { title } patch per round, and adds exactly one thing to the rung below it. Each pair re-measures the rung '
    + 'below as its floor in its own run, so a ratio prices only what its rung adds, and the rungs sum to the whole gap only to within '
    + 'the drift between runs. Up to the writer-object rung a frame is a hand-written stamp per entity and a queue, drained once per round; '
    + 'from the channel rung on it is the shipped channel and its flush.';

const ladderPair = (step: string, ours: TRung, oursText: string, floor: TRung, floorText: string, adds: string): TPricePair => ({
    id: `alt.ladder.update.${step}`,
    path: EPricePath.PerWrite,
    ours: oursText,
    floor: floorText,
    caveat: `${LADDER} This rung adds: ${adds}`,
    build: () => ({
        ours: rungSide(ours, priceFixture(priceDataset.batch)),
        floor: rungSide(floor, priceFixture(priceDataset.batch)),
    }),
});

export const alternativePairsUpdateLadder: readonly TPricePair[] = [
    ladderPair('1-patch-walk', bareForIn, 'for…in over the patch, ===, queue once per frame',
        directField, 'entity.title = value after ===, queue once per frame',
        'a patch object and a for…in over it instead of a named column.'),
    ladderPair('2-guards-and-same-value', guardedForIn, 'the same walk with the `__proto__` check, hasOwnProperty and oimSameValueZeroGuard',
        bareForIn, 'for…in over the patch, ===, queue once per frame',
        'the two key guards and the SameValueZero comparison the shipped walk runs.'),
    ladderPair('3-writer-object', writerObject, 'createOIMEntityWriterInPlace().patchEntity(slot, patch), queue once per frame',
        guardedForIn, 'the same walk written inline',
        'the call through the shipped writer object instead of the walk inlined.'),
    ladderPair('4-channel', writerAndChannel, 'the shipped writer, then OIMChannelService.INSTANCE.writeWithoutFlushCheck(channelSlot, slot); db.flush() per round',
        writerObject, 'the shipped writer, then a hand stamp and queue; drained per round',
        'the shipped channel instead of a hand-written stamp and queue.'),
    ladderPair('5a-write-asserts', withWriteAsserts, 'OIMChannelService.INSTANCE.assertNotFlushing(channelSlot) and the released check, then the writer and the channel',
        writerAndChannel, 'the shipped writer, then OIMChannelService.INSTANCE.writeWithoutFlushCheck(channelSlot, slot)',
        'what assertWritable checks: no flush running, the identity not released.'),
    ladderPair('5b-column-reader-check', withColumnReaderCheck, 'the asserts, the column-store check, the writer and the channel',
        withWriteAsserts, 'the asserts, the writer and the channel',
        'the three reads updateEntity makes before choosing its path: updatesEmptinessOnColumnWrite, whether the identity has column slots, and whether the collection has content-change listeners — here as fields of a hand-held object.'),
    ladderPair('5c-release-check', withReleaseCheck, 'the asserts and checks, the writer, the channel, then slot.owner.releaseSlotIfUnheld(slot) (one slot.owner read per slot)',
        withColumnReaderCheck, 'the asserts and checks, the writer and the channel',
        'a full releaseSlotIfUnheld after the write. The shipped updateEntity does not run it: its fast path calls releaseWrittenSlotIfUnheld, a no-op unless the release policy releases written slots, so this rung prices a check the shipped door skips by default.'),
    ladderPair('5d-collection-route', collectionDoor, 'entityService.slotContentService.updateEntity(slot, patch); db.flush() per round',
        withReleaseCheck, 'the rung-5c steps written out by hand around the shipped writer and channel',
        'the shipped route instead of the hand helpers: entityService.slotContentService.updateEntity → assertWritable, the isOnFastPath read, the writer, the channel and releaseWrittenSlotIfUnheld — not the full releaseSlotIfUnheld its floor runs, so this pair prices the route minus that check.'),
];

import { EPricePath } from './EPricePath';
import { priceSink } from './priceSink';
import type { TPricePair } from './TPricePair';
import type { TPriceSide } from './TPriceSide';
import { OIM_SLOT_FLAG_EMPTY } from '../../../core/src/engine/slot/constants/OIM_SLOT_FLAG_EMPTY';
import { OIM_SLOT_FLAG_RELEASED } from '../../../core/src/engine/slot/constants/OIM_SLOT_FLAG_RELEASED';

const REVISIONS_PER_EPOCH = 2 ** 30;

type TEffect = { isRunScheduled: boolean };

type TBucketSlot = {
    effects: TEffect[] | undefined;
    holdCount: number;
    changedAtRevision: number;
    changedAtEpoch: number;
    slotFlags: number;
    bucketSlotsStore: TBucketSlot[];
    wasEmptyBeforeChange: boolean | undefined;
    isChangedSinceAnnounce: boolean;
    owner: TBucketOwner | undefined;
};

type TContentChangeListener = {
    onContentChanged(slot: TBucketSlot): void;
    onContentChangedMany(slots: readonly TBucketSlot[]): void;
};

type TChannel = {
    revision: number;
    epoch: number;
    openedAtRevision: number;
    openedAtEpoch: number;
    afterEachFrameCount: number;
    effectsScheduledToRun: TEffect[];
    flushRequested: boolean;
    subframesOpen: number;
    flushRequestedInSubframe: boolean;
    subframeCloseCallbacks: Set<() => void>;
    changedSlotsAtSubframeClose: TBucketSlot[];
};

type TBucketOwner = {
    channel: TChannel;
    subframeDepth: number;
    subframeChangedSlots: TBucketSlot[];
    contentChangeListeners: TContentChangeListener[];
    changedBucketSlots: TBucketSlot[];
    flushChangedBucketSlots: () => void;
};

const createBucketSlot = (): TBucketSlot => ({
    effects: [{ isRunScheduled: false }],
    holdCount: 1,
    changedAtRevision: 0,
    changedAtEpoch: 0,
    slotFlags: OIM_SLOT_FLAG_EMPTY,
    bucketSlotsStore: [],
    wasEmptyBeforeChange: undefined,
    isChangedSinceAnnounce: false,
    owner: undefined,
});

const createChannel = (): TChannel => ({
    revision: 0,
    epoch: 0,
    openedAtRevision: 0,
    openedAtEpoch: 0,
    afterEachFrameCount: 0,
    effectsScheduledToRun: [],
    flushRequested: false,
    subframesOpen: 0,
    flushRequestedInSubframe: false,
    subframeCloseCallbacks: new Set(),
    changedSlotsAtSubframeClose: [],
});

const countingListener: TContentChangeListener = {
    onContentChanged: () => { priceSink.number++; },
    onContentChangedMany: slots => { priceSink.number += slots.length; },
};

const requestFlush = (channel: TChannel): void => {
    if (channel.subframesOpen !== 0) {
        channel.flushRequestedInSubframe = true;
        return;
    }
    if (channel.flushRequested) return;
    channel.flushRequested = true;
};

const isChangedInCurrentFrame = (channel: TChannel, slot: TBucketSlot): boolean => {
    if (slot.changedAtEpoch !== channel.openedAtEpoch) return slot.changedAtEpoch > channel.openedAtEpoch;
    return slot.changedAtRevision > channel.openedAtRevision;
};

const writeWithoutFlushCheck = (channel: TChannel, slot: TBucketSlot): void => {
    if (channel.revision >= REVISIONS_PER_EPOCH - 1) {
        channel.revision = 0;
        channel.epoch++;
    } else {
        channel.revision++;
    }
    const dependents = slot.effects;
    let owesAFrame = false;
    if (dependents !== undefined && dependents.length !== 0 && !isChangedInCurrentFrame(channel, slot)) {
        for (let i = 0; i < dependents.length; i++) {
            const effect = dependents[i];
            if (effect.isRunScheduled) continue;
            effect.isRunScheduled = true;
            channel.effectsScheduledToRun.push(effect);
        }
        owesAFrame = true;
    }
    slot.changedAtRevision = channel.revision;
    slot.changedAtEpoch = channel.epoch;
    if (!owesAFrame && (channel.flushRequested
        || (channel.afterEachFrameCount === 0 && channel.effectsScheduledToRun.length === 0))) return;
    requestFlush(channel);
};

const settleWrite = (slot: TBucketSlot, wasEmpty: boolean): void => {
    if ((slot.slotFlags & OIM_SLOT_FLAG_EMPTY) !== 0) return;
    if (wasEmpty && (slot.effects === undefined || slot.effects.length === 0)) priceSink.number++;
};

const releaseSlotIfUnheld = (slot: TBucketSlot): void => {
    if (slot.holdCount !== 0 || (slot.slotFlags & OIM_SLOT_FLAG_RELEASED) !== 0) return;
    priceSink.number++;
};

const contentChanged = (bucketOwner: TBucketOwner, slot: TBucketSlot): void => {
    const listeners = bucketOwner.contentChangeListeners;
    if (listeners.length === 0) return;
    if (bucketOwner.subframeDepth > 0) {
        bucketOwner.subframeChangedSlots.push(slot);
        return;
    }
    for (let i = 0; i < listeners.length; i++) listeners[i].onContentChanged(slot);
};

const deliverSubframeContentChanges = (bucketOwner: TBucketOwner): void => {
    const subframeChangedSlots = bucketOwner.subframeChangedSlots;
    const listeners = bucketOwner.contentChangeListeners;
    if (subframeChangedSlots.length === 1) {
        const slot = subframeChangedSlots[0];
        subframeChangedSlots.pop();
        for (let i = 0; i < listeners.length; i++) listeners[i].onContentChanged(slot);
        releaseSlotIfUnheld(slot);
        return;
    }
    const slots = subframeChangedSlots.slice();
    subframeChangedSlots.length = 0;
    for (let i = 0; i < listeners.length; i++) listeners[i].onContentChangedMany(slots);
    for (let i = 0; i < slots.length; i++) releaseSlotIfUnheld(slots[i]);
};

const closeChannelSubframe = (channel: TChannel): void => {
    if (channel.subframesOpen > 1) {
        channel.subframesOpen--;
        return;
    }
    const subframeCloseCallbacks = channel.subframeCloseCallbacks;
    if (subframeCloseCallbacks.size !== 0) {
        for (const callback of subframeCloseCallbacks) {
            subframeCloseCallbacks.delete(callback);
            callback();
        }
    }
    channel.subframesOpen--;
    if (channel.flushRequestedInSubframe) {
        channel.flushRequestedInSubframe = false;
        requestFlush(channel);
    }
};

const closeChannelSubframeDrainingSlots = (channel: TChannel): void => {
    if (channel.subframesOpen > 1) {
        channel.subframesOpen--;
        return;
    }
    const changedSlotsAtSubframeClose = channel.changedSlotsAtSubframeClose;
    if (changedSlotsAtSubframeClose.length !== 0) {
        for (let i = 0; i < changedSlotsAtSubframeClose.length; i++) {
            const bucketSlot = changedSlotsAtSubframeClose[i];
            flushChangedBucketSlot(bucketSlot.owner as TBucketOwner, bucketSlot);
            releaseSlotIfUnheld(bucketSlot);
        }
        changedSlotsAtSubframeClose.length = 0;
    }
    channel.subframesOpen--;
    if (channel.flushRequestedInSubframe) {
        channel.flushRequestedInSubframe = false;
        requestFlush(channel);
    }
};

const closeChannelSubframeAnnouncingAgain = (channel: TChannel): void => {
    if (channel.subframesOpen > 1) {
        channel.subframesOpen--;
        return;
    }
    const changedSlotsAtSubframeClose = channel.changedSlotsAtSubframeClose;
    if (changedSlotsAtSubframeClose.length !== 0) {
        for (let i = 0; i < changedSlotsAtSubframeClose.length; i++) {
            const bucketSlot = changedSlotsAtSubframeClose[i];
            const wasEmpty = bucketSlot.wasEmptyBeforeChange as boolean;
            bucketSlot.wasEmptyBeforeChange = undefined;
            if (bucketSlot.isChangedSinceAnnounce) {
                bucketSlot.isChangedSinceAnnounce = false;
                if ((bucketSlot.slotFlags & OIM_SLOT_FLAG_RELEASED) === 0) {
                    writeWithoutFlushCheck(channel, bucketSlot);
                    settleWrite(bucketSlot, wasEmpty);
                    contentChanged(bucketSlot.owner as TBucketOwner, bucketSlot);
                }
            }
            releaseSlotIfUnheld(bucketSlot);
        }
        changedSlotsAtSubframeClose.length = 0;
    }
    channel.subframesOpen--;
    if (channel.flushRequestedInSubframe) {
        channel.flushRequestedInSubframe = false;
        requestFlush(channel);
    }
};

const openSubframe = (bucketOwner: TBucketOwner): void => {
    bucketOwner.channel.subframesOpen++;
    bucketOwner.subframeDepth++;
};

const closeSubframe = (bucketOwner: TBucketOwner): void => {
    if (--bucketOwner.subframeDepth === 0 && bucketOwner.subframeChangedSlots.length !== 0) {
        deliverSubframeContentChanges(bucketOwner);
    }
    closeChannelSubframe(bucketOwner.channel);
};

const closeSubframeAnnouncingAgain = (bucketOwner: TBucketOwner): void => {
    if (--bucketOwner.subframeDepth === 0 && bucketOwner.subframeChangedSlots.length !== 0) {
        deliverSubframeContentChanges(bucketOwner);
    }
    closeChannelSubframeAnnouncingAgain(bucketOwner.channel);
};

const closeSubframeDrainingSlots = (bucketOwner: TBucketOwner): void => {
    if (--bucketOwner.subframeDepth === 0 && bucketOwner.subframeChangedSlots.length !== 0) {
        deliverSubframeContentChanges(bucketOwner);
    }
    closeChannelSubframeDrainingSlots(bucketOwner.channel);
};

const flushChangedBucketSlot = (bucketOwner: TBucketOwner, bucketSlot: TBucketSlot): void => {
    const wasEmpty = bucketSlot.wasEmptyBeforeChange;
    if (wasEmpty === undefined) return;
    bucketSlot.wasEmptyBeforeChange = undefined;
    if ((bucketSlot.slotFlags & OIM_SLOT_FLAG_RELEASED) !== 0) return;
    writeWithoutFlushCheck(bucketOwner.channel, bucketSlot);
    settleWrite(bucketSlot, wasEmpty);
    contentChanged(bucketOwner, bucketSlot);
};

const createBucketOwner = (listenerCount: number): TBucketOwner => {
    const bucketOwner: TBucketOwner = {
        channel: createChannel(),
        subframeDepth: 0,
        subframeChangedSlots: [],
        contentChangeListeners: listenerCount === 0 ? [] : [countingListener],
        changedBucketSlots: [],
        flushChangedBucketSlots: () => undefined,
    };
    bucketOwner.flushChangedBucketSlots = () => {
        const changedBucketSlots = bucketOwner.changedBucketSlots;
        for (let i = 0; i < changedBucketSlots.length; i++) {
            const bucketSlot = changedBucketSlots[i];
            flushChangedBucketSlot(bucketOwner, bucketSlot);
            releaseSlotIfUnheld(bucketSlot);
        }
        changedBucketSlots.length = 0;
    };
    return bucketOwner;
};

const markBucketSlotChangedCoalesced = (bucketOwner: TBucketOwner, bucketSlot: TBucketSlot): void => {
    const isFirstChange = bucketSlot.wasEmptyBeforeChange === undefined;
    if (isFirstChange) bucketSlot.wasEmptyBeforeChange = (bucketSlot.slotFlags & OIM_SLOT_FLAG_EMPTY) !== 0;
    bucketSlot.slotFlags = bucketSlot.bucketSlotsStore.length === 0 ? bucketSlot.slotFlags | OIM_SLOT_FLAG_EMPTY : bucketSlot.slotFlags & ~OIM_SLOT_FLAG_EMPTY;
    const channel = bucketOwner.channel;
    if (channel.subframesOpen > 0) {
        if (isFirstChange) bucketOwner.changedBucketSlots.push(bucketSlot);
        channel.subframeCloseCallbacks.add(bucketOwner.flushChangedBucketSlots);
    } else {
        flushChangedBucketSlot(bucketOwner, bucketSlot);
    }
};

const markBucketSlotChangedIntoChannel = (bucketOwner: TBucketOwner, bucketSlot: TBucketSlot): void => {
    const isFirstChange = bucketSlot.wasEmptyBeforeChange === undefined;
    if (isFirstChange) bucketSlot.wasEmptyBeforeChange = (bucketSlot.slotFlags & OIM_SLOT_FLAG_EMPTY) !== 0;
    bucketSlot.slotFlags = bucketSlot.bucketSlotsStore.length === 0 ? bucketSlot.slotFlags | OIM_SLOT_FLAG_EMPTY : bucketSlot.slotFlags & ~OIM_SLOT_FLAG_EMPTY;
    const channel = bucketOwner.channel;
    if (channel.subframesOpen > 0) {
        if (isFirstChange) channel.changedSlotsAtSubframeClose.push(bucketSlot);
    } else {
        flushChangedBucketSlot(bucketOwner, bucketSlot);
    }
};

const markBucketSlotChangedAdaptive = (bucketOwner: TBucketOwner, bucketSlot: TBucketSlot): void => {
    const channel = bucketOwner.channel;
    if (channel.subframesOpen <= 1) {
        markBucketSlotChangedImmediate(bucketOwner, bucketSlot);
        return;
    }
    if (bucketSlot.wasEmptyBeforeChange !== undefined) {
        bucketSlot.slotFlags = bucketSlot.bucketSlotsStore.length === 0 ? bucketSlot.slotFlags | OIM_SLOT_FLAG_EMPTY : bucketSlot.slotFlags & ~OIM_SLOT_FLAG_EMPTY;
        bucketSlot.isChangedSinceAnnounce = true;
        return;
    }
    const wasEmpty = (bucketSlot.slotFlags & OIM_SLOT_FLAG_EMPTY) !== 0;
    bucketSlot.slotFlags = bucketSlot.bucketSlotsStore.length === 0 ? bucketSlot.slotFlags | OIM_SLOT_FLAG_EMPTY : bucketSlot.slotFlags & ~OIM_SLOT_FLAG_EMPTY;
    bucketSlot.wasEmptyBeforeChange = wasEmpty;
    channel.changedSlotsAtSubframeClose.push(bucketSlot);
    if ((bucketSlot.slotFlags & OIM_SLOT_FLAG_RELEASED) !== 0) return;
    writeWithoutFlushCheck(channel, bucketSlot);
    settleWrite(bucketSlot, wasEmpty);
    contentChanged(bucketOwner, bucketSlot);
};

function markBucketSlotChangedImmediate(bucketOwner: TBucketOwner, bucketSlot: TBucketSlot): void {
    const wasEmpty = (bucketSlot.slotFlags & OIM_SLOT_FLAG_EMPTY) !== 0;
    bucketSlot.slotFlags = bucketSlot.bucketSlotsStore.length === 0 ? bucketSlot.slotFlags | OIM_SLOT_FLAG_EMPTY : bucketSlot.slotFlags & ~OIM_SLOT_FLAG_EMPTY;
    if ((bucketSlot.slotFlags & OIM_SLOT_FLAG_RELEASED) !== 0) return;
    writeWithoutFlushCheck(bucketOwner.channel, bucketSlot);
    settleWrite(bucketSlot, wasEmpty);
    contentChanged(bucketOwner, bucketSlot);
}

type TMarkBucketSlotChanged = (bucketOwner: TBucketOwner, bucketSlot: TBucketSlot) => void;

type TCloseSubframe = (bucketOwner: TBucketOwner) => void;

type TBucketWriteArm = {
    markBucketSlotChanged: TMarkBucketSlotChanged;
    closeSubframe: TCloseSubframe;
};

const coalescedBySetCallback: TBucketWriteArm = { markBucketSlotChanged: markBucketSlotChangedCoalesced, closeSubframe };

const coalescedByChannelArray: TBucketWriteArm = {
    markBucketSlotChanged: markBucketSlotChangedIntoChannel, closeSubframe: closeSubframeDrainingSlots,
};

const immediate: TBucketWriteArm = { markBucketSlotChanged: markBucketSlotChangedImmediate, closeSubframe };

const adaptive: TBucketWriteArm = {
    markBucketSlotChanged: markBucketSlotChangedAdaptive, closeSubframe: closeSubframeAnnouncingAgain,
};

const markBucketSlotChangedAdaptiveByListener = (bucketOwner: TBucketOwner, bucketSlot: TBucketSlot): void => {
    if (bucketOwner.contentChangeListeners.length !== 0) {
        markBucketSlotChangedAdaptive(bucketOwner, bucketSlot);
        return;
    }
    const wasEmpty = (bucketSlot.slotFlags & OIM_SLOT_FLAG_EMPTY) !== 0;
    bucketSlot.slotFlags = bucketSlot.bucketSlotsStore.length === 0 ? bucketSlot.slotFlags | OIM_SLOT_FLAG_EMPTY : bucketSlot.slotFlags & ~OIM_SLOT_FLAG_EMPTY;
    if ((bucketSlot.slotFlags & OIM_SLOT_FLAG_RELEASED) !== 0) return;
    const channel = bucketOwner.channel;
    writeWithoutFlushCheck(channel, bucketSlot);
    settleWrite(bucketSlot, wasEmpty);
    if (bucketSlot.holdCount !== 0 || bucketSlot.wasEmptyBeforeChange !== undefined || channel.subframesOpen === 0) return;
    bucketSlot.wasEmptyBeforeChange = wasEmpty;
    channel.changedSlotsAtSubframeClose.push(bucketSlot);
};

const adaptiveByListener: TBucketWriteArm = {
    markBucketSlotChanged: markBucketSlotChangedAdaptiveByListener, closeSubframe: closeSubframeAnnouncingAgain,
};

const memberSlot = createBucketSlot();

const closeFrame = (channel: TChannel, bucketSlots: readonly TBucketSlot[]): void => {
    channel.openedAtRevision = channel.revision;
    channel.openedAtEpoch = channel.epoch;
    channel.flushRequested = false;
    const effectsScheduledToRun = channel.effectsScheduledToRun;
    for (let i = 0; i < effectsScheduledToRun.length; i++) effectsScheduledToRun[i].isRunScheduled = false;
    effectsScheduledToRun.length = 0;
    for (let i = 0; i < bucketSlots.length; i++) {
        const bucketSlot = bucketSlots[i];
        bucketSlot.bucketSlotsStore.length = 0;
        bucketSlot.slotFlags |= OIM_SLOT_FLAG_EMPTY;
    }
};

const addSide = (bucketWriteArm: TBucketWriteArm, scenario: TBucketScenario): TPriceSide => {
    const { addsPerSubframe, bucketCount } = scenario;
    const { markBucketSlotChanged, closeSubframe: closeArmSubframe } = bucketWriteArm;
    const bucketOwner = createBucketOwner(scenario.listenerCount);
    const bucketSlots: TBucketSlot[] = [];
    for (let i = 0; i < bucketCount; i++) {
        const bucketSlot = createBucketSlot();
        bucketSlot.owner = bucketOwner;
        bucketSlot.holdCount = scenario.bucketHoldCount;
        bucketSlots.push(bucketSlot);
    }
    const runSubframe = (adds: number): void => {
        openSubframe(bucketOwner);
        for (let i = 0; i < adds; i++) {
            const bucketSlot = bucketSlots[i % bucketCount];
            openSubframe(bucketOwner);
            bucketSlot.bucketSlotsStore.push(memberSlot);
            markBucketSlotChanged(bucketOwner, bucketSlot);
            closeArmSubframe(bucketOwner);
        }
        closeArmSubframe(bucketOwner);
        closeFrame(bucketOwner.channel, bucketSlots);
    };
    const side: TPriceSide = {
        reset: () => undefined,
        run: times => {
            let remaining = times;
            while (remaining >= addsPerSubframe) {
                runSubframe(addsPerSubframe);
                remaining -= addsPerSubframe;
            }
            if (remaining !== 0) runSubframe(remaining);
        },
    };
    side.run(addsPerSubframe * 256);
    return side;
};

type TBucketScenario = {
    readonly name: string;
    readonly what: string;
    readonly caveat: string;
    readonly addsPerSubframe: number;
    readonly bucketCount: number;
    readonly listenerCount: number;
    readonly bucketHoldCount: number;
};

const pairOf = (
    id: string, scenario: TBucketScenario, floor: string, floorArm: TBucketWriteArm, caveat: string,
): TPricePair => ({
    id,
    path: EPricePath.PerRowPerWrite,
    ours: `${scenario.what}, coalesced: the bucket marked pending, flushed by a subframe-close callback`,
    floor,
    caveat: `${scenario.caveat} ${caveat} ${COMMON_CAVEAT}`,
    build: () => ({
        ours: addSide(coalescedBySetCallback, scenario),
        floor: addSide(floorArm, scenario),
    }),
});

const COMMON_CAVEAT =
    'One operation is one member add. Both arms open the same nested subframe around each add, push the member into '
    + 'the bucket store, and close the frame after every outer subframe; emptying the stores there is timed on both '
    + 'arms alike. The bucket slot is held and has one effect, so the channel write door takes its effect path: the '
    + 'first write of a frame schedules the effect and the rest find it scheduled. The bodies copy '
    + 'OIMBucketWriter.markBucketSlotChanged, OIMChannel.writeWithoutFlushCheck and closeSubframe, and '
    + 'OIMSlotContentOwner.settleWrite, contentChanged and its subframe delivery, as of 2026-10-21. The release '
    + 'policy is the default one, which does nothing on a write, so neither arm calls it.';

const oneBucketScenario = (adds: number): TBucketScenario => ({
    name: `one-bucket-${adds}-adds`,
    what: `${adds} adds to one bucket in one subframe`,
    caveat: `${adds} adds to ONE bucket inside one subframe. No content-change listener.`,
    addsPerSubframe: adds,
    bucketCount: 1,
    listenerCount: 0,
    bucketHoldCount: 1,
});

const listenerScenario = (adds: number): TBucketScenario => ({
    name: `one-bucket-${adds}-adds-with-a-listener`,
    what: `${adds} adds to one bucket in one subframe, one content-change listener`,
    caveat: `${adds} adds to ONE bucket inside one subframe, one content-change listener on the bucket owner. `
        + 'Without coalescing each add is still buffered by the owner\'s own subframe and delivered at the close as '
        + `onContentChangedMany with one entry per add, so the listener hears ${adds} changes of one bucket.`,
    addsPerSubframe: adds,
    bucketCount: 1,
    listenerCount: 1,
    bucketHoldCount: 1,
});

const spreadScenario = (adds: number): TBucketScenario => ({
    name: `${adds}-buckets-one-add-each`,
    what: `${adds} adds, one to each of ${adds} buckets, in one subframe`,
    caveat: `${adds} adds spread over ${adds} different buckets inside one subframe, so there is nothing to `
        + 'coalesce: every bucket changes once. No content-change listener.',
    addsPerSubframe: adds,
    bucketCount: adds,
    listenerCount: 0,
    bucketHoldCount: 1,
});

const SCENARIOS: readonly TBucketScenario[] = [
    ...[1, 8, 64].map(oneBucketScenario),
    ...[1, 8, 64].map(listenerScenario),
    ...[8, 64].map(spreadScenario),
];

const UNHELD_SCENARIOS: readonly TBucketScenario[] = SCENARIOS.map(scenario => ({
    ...scenario,
    name: `unheld.${scenario.name}`,
    caveat: `${scenario.caveat} Every bucket is UNHELD (holdCount 0), so each one is releasable at the close and `
        + 'its release check runs on both arms.',
    bucketHoldCount: 0,
}));

export const alternativePairsBucketCoalescing: readonly TPricePair[] = [
    ...SCENARIOS.map(scenario => pairOf(
        `alt.bucket-coalescing.${scenario.name}`,
        scenario,
        'the same adds, each one written to the channel, settled and announced at once',
        immediate,
        'The shipped arm marks the bucket pending once, registers a close callback in the channel\'s Set on every '
        + 'add, and writes, settles and announces the bucket once when the outermost subframe closes; the '
        + 'alternative does all three on every add.',
    )),
    ...SCENARIOS.map(scenario => pairOf(
        `alt.bucket-coalescing.channel-array.${scenario.name}`,
        scenario,
        'the same coalescing, with the pending bucket pushed once into an array the channel owns and drains at '
        + 'the outermost subframe close, and no close callback',
        coalescedByChannelArray,
        'Both arms coalesce identically and differ only in how the pending buckets reach the close: the shipped '
        + 'arm adds its flush callback to the channel\'s Set on every add and the channel iterates that Set; the '
        + 'alternative pushes each bucket once into a channel-owned array, finds the owner through slot.owner and '
        + 'drains the array in a plain loop.',
    )),
    ...SCENARIOS.map(scenario => pairOf(
        `alt.bucket-coalescing.adaptive.${scenario.name}`,
        scenario,
        'adaptive coalescing: a bucket\'s first change in a batch is written, settled and announced at once and the '
        + 'bucket is pushed once into a channel-owned array; later changes in the same subframe only flag it, and '
        + 'the outermost close writes and announces each flagged bucket once more, then runs its release check',
        adaptive,
        'Every scenario here opens an outer subframe, so the adaptive arm always takes its batch path: the first '
        + 'change of each bucket costs what the immediate arm pays, and from the second change on it pays one flag '
        + 'write per add plus one more write and announce per bucket at the close. With a listener, the first '
        + 'announce is buffered by the owner\'s subframe and the second reaches the listener directly at the channel '
        + 'close, so a bucket changed more than once is heard twice. A single-item door with no outer subframe '
        + 'takes the immediate path and is not among these scenarios.',
    )),
    ...[...SCENARIOS, ...UNHELD_SCENARIOS].map(scenario => pairOf(
        `alt.bucket-coalescing.adaptive-by-listener.${scenario.name}`,
        scenario,
        'adaptive by listener: with no content-change listener every change is written, settled and announced at '
        + 'once, and the bucket is pushed once into the channel-owned array only when it is releasable (unheld); '
        + 'with a listener it behaves as the adaptive arm',
        adaptiveByListener,
        'Held scenarios never reach the array on this arm when no listener exists, so they price the immediate path '
        + 'plus one listener-count check and one hold-count check per add. Unheld scenarios also pay one push per '
        + 'bucket and its release check at the close. The model reads releasability as holdCount 0; the shipped '
        + 'release policy is the default, which releases an unheld bucket only when it is empty.',
    )),
];

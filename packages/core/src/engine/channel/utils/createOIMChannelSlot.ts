import type { TOIMChannelSlot } from '../types/TOIMChannelSlot';
import type { TOIMChannelSlotOptions } from '../types/TOIMChannelSlotOptions';
import type { TOIMEffect } from '../../computed/types/TOIMEffect';
import type { TOIMStoreSlot } from '../../slot/types/TOIMStoreSlot';
import type { IOIMSubframeCloseListener } from '../../slot/interfaces/IOIMSubframeCloseListener';
import { OIMChannelQueue } from '../OIMChannelQueue';

export function createOIMChannelSlot(options: TOIMChannelSlotOptions): TOIMChannelSlot {
    return {
        timer: options.timer,
        scheduledCallback: undefined,
        timerDisposer: undefined,
        clock: options.clock,
        frame: { isRunning: false, openedAtRevision: options.clock.revision, openedAtEpoch: options.clock.epoch, afterEachFrame: new Set() },
        collectorSlot: options.collectorSlot,
        errorPolicy: options.errorPolicy,
        onBeforeFlush: options.onBeforeFlush,
        effectChannelQueue: new OIMChannelQueue<TOIMEffect>(),
        afterEachFlush: new Set(),
        afterEachFrameHandlerChannelQueue: new OIMChannelQueue<() => void>(),
        subframeStoreSlotChannelQueues: [],
        changedStoreSlotChannelQueue: new OIMChannelQueue<TOIMStoreSlot>(),
        changedStoreSlotOwnerChannelQueue: new OIMChannelQueue<IOIMSubframeCloseListener>(),
        commandsStoreSlotChannelQueue: undefined,
        changedColumnNames: undefined,
        subframesOpen: 0,
        contentSubframeDepth: 0,
        subframeDeliveryDepth: 0,
        flushRequestedInSubframe: false,
        flushRequested: false,
        isFlushing: false,
        dropped: false,
    };
}

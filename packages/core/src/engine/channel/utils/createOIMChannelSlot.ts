import type { TOIMChannelSlot } from '../types/TOIMChannelSlot';
import type { TOIMChannelSlotOptions } from '../types/TOIMChannelSlotOptions';
import type { TOIMEffect } from '../../computed/types/TOIMEffect';
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
        commandsStoreSlotChannelQueue: undefined,
        changedColumnNames: undefined,
        flushRequested: false,
        isFlushing: false,
        dropped: false,
    };
}

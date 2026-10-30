import type { TOIMEffect } from '../../effect/types/TOIMEffect';
import type { TOIMStoreSlot } from '../../slot/types/TOIMStoreSlot';
import type { TOIMCollectorSlot } from '../../collector/types/TOIMCollectorSlot';
import type { IOIMErrorPolicy } from '../../error/interfaces/IOIMErrorPolicy';
import type { TOIMFlushSchedulerSlot } from '../../schedule/types/TOIMFlushSchedulerSlot';
import type { OIMChannelQueue } from '../OIMChannelQueue';
import type { TOIMChannelClock } from './TOIMChannelClock';
import type { TOIMChannelFrame } from './TOIMChannelFrame';

export type TOIMChannelSlot = TOIMFlushSchedulerSlot & {
    readonly clock: TOIMChannelClock;
    readonly frame: TOIMChannelFrame;
    readonly collectorSlot: TOIMCollectorSlot;
    readonly errorPolicy: IOIMErrorPolicy;
    readonly onBeforeFlush: (() => void) | undefined;
    readonly effectChannelQueue: OIMChannelQueue<TOIMEffect>;
    readonly afterEachFlush: Set<() => void>;
    readonly afterEachFrameHandlerChannelQueue: OIMChannelQueue<() => void>;
    commandsStoreSlotChannelQueue: OIMChannelQueue<TOIMStoreSlot> | undefined;
    changedColumnNames: string[] | undefined;
    flushRequested: boolean;
    isFlushing: boolean;
    dropped: boolean;
};

import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import type { TOIMFlushSchedulerSlot } from '../../schedule/types/TOIMFlushSchedulerSlot';
import type { IOIMErrorPolicy } from '../../error/interfaces/IOIMErrorPolicy';

export type TOIMReleaseSlotCollectorSlot = TOIMFlushSchedulerSlot & {
    readonly getNowMs: () => number;
    readonly errorPolicy: IOIMErrorPolicy;
    scheduledUntilMs: number;
    readonly slotsBySliceNumber: Map<number, Set<TOIMSlot>>;
    readonly sliceNumberBySlot: Map<TOIMSlot, number>;
    floorSliceNumber: number;
    nextSliceNumber: number | undefined;
    nextSliceNumberNeedsRescan: boolean;
};

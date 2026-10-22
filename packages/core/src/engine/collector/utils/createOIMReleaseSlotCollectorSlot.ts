import type { TOIMReleaseSlotCollectorSlot } from '../types/TOIMReleaseSlotCollectorSlot';
import type { TOIMCollectorSlotOptions } from '../types/TOIMCollectorSlotOptions';

export function createOIMReleaseSlotCollectorSlot(options: TOIMCollectorSlotOptions): TOIMReleaseSlotCollectorSlot {
    return {
        timer: options.releaseTimer,
        scheduledCallback: undefined,
        timerDisposer: undefined,
        getNowMs: options.getNowMs,
        errorPolicy: options.errorPolicy,
        scheduledUntilMs: Number.POSITIVE_INFINITY,
        slotsBySliceNumber: new Map(),
        sliceNumberBySlot: new Map(),
        floorSliceNumber: Number.NEGATIVE_INFINITY,
        nextSliceNumber: undefined,
        nextSliceNumberNeedsRescan: false,
    };
}

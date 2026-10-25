import type { TOIMCollectorSlot } from '../types/TOIMCollectorSlot';
import type { TOIMCollectorSlotOptions } from '../types/TOIMCollectorSlotOptions';
import { createOIMUnusedSlotCollectorSlot } from './createOIMUnusedSlotCollectorSlot';

export function createOIMCollectorSlot(options: TOIMCollectorSlotOptions): TOIMCollectorSlot {
    return {
        unusedSlotCollectorSlot: createOIMUnusedSlotCollectorSlot(),
        slotWheelOptions: { getNowMs: options.getNowMs, timer: options.releaseTimer, errorPolicy: options.errorPolicy },
        afterIdleSlotReleaseWheel: undefined,
        afterWriteSlotReleaseWheel: undefined,
        afterUnholdSlotReleaseWheel: undefined,
    };
}

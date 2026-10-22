import type { TOIMCollectorSlot } from '../types/TOIMCollectorSlot';
import type { TOIMCollectorSlotOptions } from '../types/TOIMCollectorSlotOptions';
import { createOIMUnusedSlotCollectorSlot } from './createOIMUnusedSlotCollectorSlot';
import { createOIMReleaseSlotCollectorSlot } from './createOIMReleaseSlotCollectorSlot';

export function createOIMCollectorSlot(options: TOIMCollectorSlotOptions): TOIMCollectorSlot {
    return {
        unusedSlotCollectorSlot: createOIMUnusedSlotCollectorSlot(),
        afterIdleReleaseSlotCollectorSlot: createOIMReleaseSlotCollectorSlot(options),
        afterWriteReleaseSlotCollectorSlot: createOIMReleaseSlotCollectorSlot(options),
        afterUnholdReleaseSlotCollectorSlot: createOIMReleaseSlotCollectorSlot(options),
    };
}

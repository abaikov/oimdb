import type { TOIMUnusedSlotCollectorSlot } from './TOIMUnusedSlotCollectorSlot';
import type { TOIMReleaseSlotCollectorSlot } from './TOIMReleaseSlotCollectorSlot';

export type TOIMCollectorSlot = {
    readonly unusedSlotCollectorSlot: TOIMUnusedSlotCollectorSlot;
    readonly afterIdleReleaseSlotCollectorSlot: TOIMReleaseSlotCollectorSlot;
    readonly afterWriteReleaseSlotCollectorSlot: TOIMReleaseSlotCollectorSlot;
    readonly afterUnholdReleaseSlotCollectorSlot: TOIMReleaseSlotCollectorSlot;
};

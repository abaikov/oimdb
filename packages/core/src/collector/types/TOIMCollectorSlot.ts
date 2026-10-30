import type { TOIMUnusedSlotCollectorSlot } from './TOIMUnusedSlotCollectorSlot';
import type { TOIMSlotWheelOptions } from './TOIMSlotWheelOptions';
import type { OIMSlotReleaseWheel } from '../OIMSlotReleaseWheel';

export type TOIMCollectorSlot = {
    readonly unusedSlotCollectorSlot: TOIMUnusedSlotCollectorSlot;
    readonly slotWheelOptions: TOIMSlotWheelOptions;
    afterIdleSlotReleaseWheel: OIMSlotReleaseWheel | undefined;
    afterWriteSlotReleaseWheel: OIMSlotReleaseWheel | undefined;
    afterUnholdSlotReleaseWheel: OIMSlotReleaseWheel | undefined;
};

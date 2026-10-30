import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import type { TOIMSlotWheelOptions } from './TOIMSlotWheelOptions';

export type TOIMSlotReleaseWheelOptions = TOIMSlotWheelOptions & {
    getReleaseDueMs: (slot: TOIMSlot) => number;
    setReleaseDueMs: (slot: TOIMSlot, releaseDueMs: number) => void;
    releaseScheduledSlotFlag: number;
};

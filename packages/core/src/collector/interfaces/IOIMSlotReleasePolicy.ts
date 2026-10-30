import type { TOIMSlot } from '../../slot/types/TOIMSlot';

export interface IOIMSlotReleasePolicy {
    readonly releasesWrittenSlots: boolean;
    readonly schedulesReleaseOnWrite: boolean;
    onSlotWritten(slot: TOIMSlot): void;
    onSlotIdle(slot: TOIMSlot): boolean;
    onSlotUnheld(slot: TOIMSlot): void;
    isSlotReleasable(slot: TOIMSlot): boolean;
    isEmptySlotReleasable(slot: TOIMSlot): boolean;
    cancelSlotRelease(slot: TOIMSlot): void;
}

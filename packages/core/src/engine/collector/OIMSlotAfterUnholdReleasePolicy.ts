import type { IOIMSlotReleasePolicy } from './interfaces/IOIMSlotReleasePolicy';
import type { TOIMSlotAfterUnholdReleasePolicyOptions } from './types/TOIMSlotAfterUnholdReleasePolicyOptions';
import type { TOIMSlot } from '../slot/types/TOIMSlot';
import { oimGetChannelSlot } from '../slot/utils/oimGetChannelSlot';
import { oimMintAfterUnholdSlotReleaseWheel } from './utils/oimMintAfterUnholdSlotReleaseWheel';

export class OIMSlotAfterUnholdReleasePolicy implements IOIMSlotReleasePolicy {
    public readonly releasesWrittenSlots = true;

    public readonly schedulesReleaseOnWrite = false;

    private readonly keepAfterUnholdMs: number;

    public constructor(options: TOIMSlotAfterUnholdReleasePolicyOptions) {
        this.keepAfterUnholdMs = options.keepAfterUnholdMs;
    }

    public onSlotWritten(): void {
        return;
    }

    public onSlotIdle(): boolean {
        return false;
    }

    public onSlotUnheld(slot: TOIMSlot): void {
        oimMintAfterUnholdSlotReleaseWheel(oimGetChannelSlot(slot).collectorSlot).markSlotReleaseDue(slot, this.keepAfterUnholdMs);
    }

    public isSlotReleasable(slot: TOIMSlot): boolean {
        return oimMintAfterUnholdSlotReleaseWheel(oimGetChannelSlot(slot).collectorSlot).isSlotReleasable(slot);
    }

    public isEmptySlotReleasable(): boolean {
        return true;
    }

    public cancelSlotRelease(slot: TOIMSlot): void {
        oimMintAfterUnholdSlotReleaseWheel(oimGetChannelSlot(slot).collectorSlot).cancelSlotRelease(slot);
    }
}

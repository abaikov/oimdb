import type { IOIMSlotReleasePolicy } from './interfaces/IOIMSlotReleasePolicy';
import type { TOIMSlotAfterIdleReleasePolicyOptions } from './types/TOIMSlotAfterIdleReleasePolicyOptions';
import type { TOIMSlot } from '../slot/types/TOIMSlot';
import { oimGetChannelSlot } from '../slot/utils/oimGetChannelSlot';
import { oimMintAfterIdleSlotReleaseWheel } from './utils/oimMintAfterIdleSlotReleaseWheel';

export class OIMSlotAfterIdleReleasePolicy implements IOIMSlotReleasePolicy {
    public readonly releasesWrittenSlots = true;

    public readonly schedulesReleaseOnWrite = true;

    private readonly keepAfterIdleMs: number;

    public constructor(options: TOIMSlotAfterIdleReleasePolicyOptions) {
        this.keepAfterIdleMs = options.keepAfterIdleMs;
    }

    public onSlotWritten(): void {
        return;
    }

    public onSlotIdle(slot: TOIMSlot): boolean {
        const afterIdleSlotReleaseWheel = oimMintAfterIdleSlotReleaseWheel(oimGetChannelSlot(slot).collectorSlot);
        const nowMs = afterIdleSlotReleaseWheel.markSlotReleaseDue(slot, this.keepAfterIdleMs);
        if (this.keepAfterIdleMs <= 0) return true;
        afterIdleSlotReleaseWheel.scheduleSlotRelease(slot, nowMs);
        return false;
    }

    public onSlotUnheld(): void {
        return;
    }

    public isSlotReleasable(slot: TOIMSlot): boolean {
        return oimMintAfterIdleSlotReleaseWheel(oimGetChannelSlot(slot).collectorSlot).isSlotReleasable(slot);
    }

    public isEmptySlotReleasable(): boolean {
        return true;
    }

    public cancelSlotRelease(slot: TOIMSlot): void {
        oimMintAfterIdleSlotReleaseWheel(oimGetChannelSlot(slot).collectorSlot).cancelSlotRelease(slot);
    }
}

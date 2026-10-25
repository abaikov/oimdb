import type { IOIMSlotReleasePolicy } from './interfaces/IOIMSlotReleasePolicy';
import type { TOIMSlotAfterWriteReleasePolicyOptions } from './types/TOIMSlotAfterWriteReleasePolicyOptions';
import type { TOIMSlot } from '../slot/types/TOIMSlot';
import type { IOIMSlotReleaseDueFramePolicy } from './interfaces/IOIMSlotReleaseDueFramePolicy';
import { OIMSlotReleaseAutoDueFramePolicy } from './OIMSlotReleaseAutoDueFramePolicy';
import { oimGetChannelSlot } from '../slot/utils/oimGetChannelSlot';
import { oimMintAfterWriteSlotReleaseWheel } from './utils/oimMintAfterWriteSlotReleaseWheel';

export class OIMSlotAfterWriteReleasePolicy implements IOIMSlotReleasePolicy {
    public readonly releasesWrittenSlots = true;

    public readonly schedulesReleaseOnWrite = true;

    private readonly keepAfterWriteMs: number;

    private readonly slotReleaseDueFramePolicy: IOIMSlotReleaseDueFramePolicy;

    public constructor(options: TOIMSlotAfterWriteReleasePolicyOptions) {
        this.keepAfterWriteMs = options.keepAfterWriteMs;
        this.slotReleaseDueFramePolicy = options.slotReleaseDueFramePolicy ?? OIMSlotReleaseAutoDueFramePolicy.INSTANCE;
    }

    public onSlotWritten(slot: TOIMSlot): void {
        if (!this.slotReleaseDueFramePolicy.isSlotReleaseDueFrameOpen()) return;
        oimMintAfterWriteSlotReleaseWheel(oimGetChannelSlot(slot).collectorSlot).markSlotReleaseDue(slot, this.keepAfterWriteMs);
    }

    public onSlotIdle(slot: TOIMSlot): boolean {
        return oimMintAfterWriteSlotReleaseWheel(oimGetChannelSlot(slot).collectorSlot).isSlotReleasable(slot);
    }

    public onSlotUnheld(): void {
        return;
    }

    public isSlotReleasable(slot: TOIMSlot): boolean {
        return oimMintAfterWriteSlotReleaseWheel(oimGetChannelSlot(slot).collectorSlot).isSlotReleasable(slot);
    }

    public isEmptySlotReleasable(): boolean {
        return true;
    }

    public cancelSlotRelease(slot: TOIMSlot): void {
        oimMintAfterWriteSlotReleaseWheel(oimGetChannelSlot(slot).collectorSlot).cancelSlotRelease(slot);
    }
}

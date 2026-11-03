import type { IOIMSlotReleasePolicy } from './interfaces/IOIMSlotReleasePolicy';
import type { TOIMSlotAfterWriteReleasePolicyOptions } from './types/TOIMSlotAfterWriteReleasePolicyOptions';
import type { TOIMSlot } from '../slot/types/TOIMSlot';
import type { IOIMSlotReleaseDueFramePolicy } from './interfaces/IOIMSlotReleaseDueFramePolicy';
import { OIMSlotReleaseAutoDueFramePolicy } from './OIMSlotReleaseAutoDueFramePolicy';
import { peekOIMChannelSlot } from '../slot/utils/peekOIMChannelSlot';
import { mintOIMAfterWriteSlotReleaseWheel } from './utils/mintOIMAfterWriteSlotReleaseWheel';

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
        mintOIMAfterWriteSlotReleaseWheel(peekOIMChannelSlot(slot).collectorSlot).markSlotReleaseDue(slot, this.keepAfterWriteMs);
    }

    public onSlotIdle(slot: TOIMSlot): boolean {
        return mintOIMAfterWriteSlotReleaseWheel(peekOIMChannelSlot(slot).collectorSlot).isSlotReleasable(slot);
    }

    public onSlotUnheld(): void {
        return;
    }

    public isSlotReleasable(slot: TOIMSlot): boolean {
        return mintOIMAfterWriteSlotReleaseWheel(peekOIMChannelSlot(slot).collectorSlot).isSlotReleasable(slot);
    }

    public isEmptySlotReleasable(): boolean {
        return true;
    }

    public cancelSlotRelease(slot: TOIMSlot): void {
        mintOIMAfterWriteSlotReleaseWheel(peekOIMChannelSlot(slot).collectorSlot).cancelSlotRelease(slot);
    }
}

import type { IOIMSlotReleasePolicy } from './interfaces/IOIMSlotReleasePolicy';
import type { TOIMSlotAfterIdleReleasePolicyOptions } from './types/TOIMSlotAfterIdleReleasePolicyOptions';
import type { TOIMSlot } from '../slot/types/TOIMSlot';
import { peekOIMChannelSlot } from '../slot/utils/peekOIMChannelSlot';
import { mintOIMAfterIdleSlotReleaseWheel } from './utils/mintOIMAfterIdleSlotReleaseWheel';

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
        const afterIdleSlotReleaseWheel = mintOIMAfterIdleSlotReleaseWheel(peekOIMChannelSlot(slot).collectorSlot);
        const nowMs = afterIdleSlotReleaseWheel.markSlotReleaseDue(slot, this.keepAfterIdleMs);
        if (this.keepAfterIdleMs <= 0) return true;
        afterIdleSlotReleaseWheel.scheduleSlotRelease(slot, nowMs);
        return false;
    }

    public onSlotUnheld(): void {
        return;
    }

    public isSlotReleasable(slot: TOIMSlot): boolean {
        return mintOIMAfterIdleSlotReleaseWheel(peekOIMChannelSlot(slot).collectorSlot).isSlotReleasable(slot);
    }

    public isEmptySlotReleasable(): boolean {
        return true;
    }

    public cancelSlotRelease(slot: TOIMSlot): void {
        mintOIMAfterIdleSlotReleaseWheel(peekOIMChannelSlot(slot).collectorSlot).cancelSlotRelease(slot);
    }
}

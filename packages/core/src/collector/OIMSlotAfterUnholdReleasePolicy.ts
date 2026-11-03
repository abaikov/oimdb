import type { IOIMSlotReleasePolicy } from './interfaces/IOIMSlotReleasePolicy';
import type { TOIMSlotAfterUnholdReleasePolicyOptions } from './types/TOIMSlotAfterUnholdReleasePolicyOptions';
import type { TOIMSlot } from '../slot/types/TOIMSlot';
import { peekOIMChannelSlot } from '../slot/utils/peekOIMChannelSlot';
import { mintOIMAfterUnholdSlotReleaseWheel } from './utils/mintOIMAfterUnholdSlotReleaseWheel';

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
        mintOIMAfterUnholdSlotReleaseWheel(peekOIMChannelSlot(slot).collectorSlot).markSlotReleaseDue(slot, this.keepAfterUnholdMs);
    }

    public isSlotReleasable(slot: TOIMSlot): boolean {
        return mintOIMAfterUnholdSlotReleaseWheel(peekOIMChannelSlot(slot).collectorSlot).isSlotReleasable(slot);
    }

    public isEmptySlotReleasable(): boolean {
        return true;
    }

    public cancelSlotRelease(slot: TOIMSlot): void {
        mintOIMAfterUnholdSlotReleaseWheel(peekOIMChannelSlot(slot).collectorSlot).cancelSlotRelease(slot);
    }
}

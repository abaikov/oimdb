import type { IOIMSlotReleasePolicy } from './interfaces/IOIMSlotReleasePolicy';
import type { TOIMSlotReleasePolicyAfterUnholdOptions } from './types/TOIMSlotReleasePolicyAfterUnholdOptions';
import type { TOIMSlot } from '../slot/types/TOIMSlot';
import { OIMReleaseSlotCollectorServiceAfterUnhold } from './OIMReleaseSlotCollectorServiceAfterUnhold';

export class OIMSlotReleasePolicyAfterUnhold implements IOIMSlotReleasePolicy {
    public readonly releasesWrittenSlots = true;

    public readonly schedulesReleaseOnWrite = false;

    private readonly keepAfterUnholdMs: number;

    public constructor(options: TOIMSlotReleasePolicyAfterUnholdOptions) {
        this.keepAfterUnholdMs = options.keepAfterUnholdMs;
    }

    public onSlotWritten(): void {
        return;
    }

    public onSlotIdle(): boolean {
        return false;
    }

    public onSlotUnheld(slot: TOIMSlot): void {
        OIMReleaseSlotCollectorServiceAfterUnhold.INSTANCE.markSlotReleaseDue(OIMReleaseSlotCollectorServiceAfterUnhold.INSTANCE.getReleaseSlotCollectorSlotOf(slot), slot, this.keepAfterUnholdMs);
    }

    public isSlotReleasable(slot: TOIMSlot): boolean {
        return OIMReleaseSlotCollectorServiceAfterUnhold.INSTANCE.isSlotReleasable(OIMReleaseSlotCollectorServiceAfterUnhold.INSTANCE.getReleaseSlotCollectorSlotOf(slot), slot);
    }

    public isEmptySlotReleasable(): boolean {
        return true;
    }

    public cancelSlotRelease(slot: TOIMSlot): void {
        OIMReleaseSlotCollectorServiceAfterUnhold.INSTANCE.cancelSlotRelease(OIMReleaseSlotCollectorServiceAfterUnhold.INSTANCE.getReleaseSlotCollectorSlotOf(slot), slot);
    }
}

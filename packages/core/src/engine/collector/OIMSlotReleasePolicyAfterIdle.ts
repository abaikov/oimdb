import type { IOIMSlotReleasePolicy } from './interfaces/IOIMSlotReleasePolicy';
import type { TOIMSlotReleasePolicyAfterIdleOptions } from './types/TOIMSlotReleasePolicyAfterIdleOptions';
import type { TOIMSlot } from '../slot/types/TOIMSlot';
import { OIMReleaseSlotCollectorServiceAfterIdle } from './OIMReleaseSlotCollectorServiceAfterIdle';

export class OIMSlotReleasePolicyAfterIdle implements IOIMSlotReleasePolicy {
    public readonly releasesWrittenSlots = true;

    public readonly schedulesReleaseOnWrite = true;

    private readonly keepAfterIdleMs: number;

    public constructor(options: TOIMSlotReleasePolicyAfterIdleOptions) {
        this.keepAfterIdleMs = options.keepAfterIdleMs;
    }

    public onSlotWritten(): void {
        return;
    }

    public onSlotIdle(slot: TOIMSlot): boolean {
        const releaseSlotCollectorService = OIMReleaseSlotCollectorServiceAfterIdle.INSTANCE;
        const releaseSlotCollectorSlot = OIMReleaseSlotCollectorServiceAfterIdle.INSTANCE.getReleaseSlotCollectorSlotOf(slot);
        const nowMs = releaseSlotCollectorService.markSlotReleaseDue(releaseSlotCollectorSlot, slot, this.keepAfterIdleMs);
        if (this.keepAfterIdleMs <= 0) return true;
        releaseSlotCollectorService.scheduleSlotRelease(releaseSlotCollectorSlot, slot, nowMs);
        return false;
    }

    public onSlotUnheld(): void {
        return;
    }

    public isSlotReleasable(slot: TOIMSlot): boolean {
        return OIMReleaseSlotCollectorServiceAfterIdle.INSTANCE.isSlotReleasable(OIMReleaseSlotCollectorServiceAfterIdle.INSTANCE.getReleaseSlotCollectorSlotOf(slot), slot);
    }

    public isEmptySlotReleasable(): boolean {
        return true;
    }

    public cancelSlotRelease(slot: TOIMSlot): void {
        OIMReleaseSlotCollectorServiceAfterIdle.INSTANCE.cancelSlotRelease(OIMReleaseSlotCollectorServiceAfterIdle.INSTANCE.getReleaseSlotCollectorSlotOf(slot), slot);
    }
}

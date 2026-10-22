import type { IOIMSlotReleasePolicy } from './interfaces/IOIMSlotReleasePolicy';
import type { TOIMSlotReleasePolicyAfterWriteOptions } from './types/TOIMSlotReleasePolicyAfterWriteOptions';
import type { TOIMSlot } from '../slot/types/TOIMSlot';
import { OIMReleaseSlotCollectorServiceAfterWrite } from './OIMReleaseSlotCollectorServiceAfterWrite';

export class OIMSlotReleasePolicyAfterWrite implements IOIMSlotReleasePolicy {
    public readonly releasesWrittenSlots = true;

    public readonly schedulesReleaseOnWrite = true;

    private readonly keepAfterWriteMs: number;

    public constructor(options: TOIMSlotReleasePolicyAfterWriteOptions) {
        this.keepAfterWriteMs = options.keepAfterWriteMs;
    }

    public onSlotWritten(slot: TOIMSlot): void {
        OIMReleaseSlotCollectorServiceAfterWrite.INSTANCE.markSlotReleaseDue(OIMReleaseSlotCollectorServiceAfterWrite.INSTANCE.getReleaseSlotCollectorSlotOf(slot), slot, this.keepAfterWriteMs);
    }

    public onSlotIdle(slot: TOIMSlot): boolean {
        return OIMReleaseSlotCollectorServiceAfterWrite.INSTANCE.isSlotReleasable(OIMReleaseSlotCollectorServiceAfterWrite.INSTANCE.getReleaseSlotCollectorSlotOf(slot), slot);
    }

    public onSlotUnheld(): void {
        return;
    }

    public isSlotReleasable(slot: TOIMSlot): boolean {
        return OIMReleaseSlotCollectorServiceAfterWrite.INSTANCE.isSlotReleasable(OIMReleaseSlotCollectorServiceAfterWrite.INSTANCE.getReleaseSlotCollectorSlotOf(slot), slot);
    }

    public isEmptySlotReleasable(): boolean {
        return true;
    }

    public cancelSlotRelease(slot: TOIMSlot): void {
        OIMReleaseSlotCollectorServiceAfterWrite.INSTANCE.cancelSlotRelease(OIMReleaseSlotCollectorServiceAfterWrite.INSTANCE.getReleaseSlotCollectorSlotOf(slot), slot);
    }
}

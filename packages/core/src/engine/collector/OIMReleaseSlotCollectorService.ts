import type { TOIMSlot } from '../slot/types/TOIMSlot';
import type { TOIMCollectorSlot } from './types/TOIMCollectorSlot';
import type { TOIMReleaseSlotCollectorSlot } from './types/TOIMReleaseSlotCollectorSlot';
import { OIMFlushSchedulerService } from '../schedule/OIMFlushSchedulerService';
import { OIMReleaseSlotQueueService } from './OIMReleaseSlotQueueService';
import { oimSliceOfMs } from './utils/oimSliceOfMs';
import { oimGetChannelSlot } from '../slot/utils/oimGetChannelSlot';
import { OIM_SLICE_LENGTH_MS } from './constants/OIM_SLICE_LENGTH_MS';

export abstract class OIMReleaseSlotCollectorService extends OIMFlushSchedulerService<TOIMReleaseSlotCollectorSlot> {
    public abstract readonly getReleaseDueMs: (slot: TOIMSlot) => number;

    protected abstract readonly setReleaseDueMs: (slot: TOIMSlot, releaseDueMs: number) => void;

    public abstract getReleaseSlotCollectorSlot(collectorSlot: TOIMCollectorSlot): TOIMReleaseSlotCollectorSlot;

    public getReleaseSlotCollectorSlotOf(slot: TOIMSlot): TOIMReleaseSlotCollectorSlot {
        return this.getReleaseSlotCollectorSlot(oimGetChannelSlot(slot).collectorSlot);
    }

    public markSlotReleaseDue(releaseSlotCollectorSlot: TOIMReleaseSlotCollectorSlot, slot: TOIMSlot, keepMs: number): number {
        const nowMs = releaseSlotCollectorSlot.getNowMs();
        this.setReleaseDueMs(slot, nowMs + keepMs);
        return nowMs;
    }

    public scheduleSlotRelease(releaseSlotCollectorSlot: TOIMReleaseSlotCollectorSlot, slot: TOIMSlot, nowMs: number): void {
        OIMReleaseSlotQueueService.INSTANCE.scheduleSlotRelease(releaseSlotCollectorSlot, this, slot, nowMs);
    }

    public isSlotReleasable(releaseSlotCollectorSlot: TOIMReleaseSlotCollectorSlot, slot: TOIMSlot): boolean {
        const releaseDueMs = this.getReleaseDueMs(slot);
        if (releaseDueMs < 0) return false;
        const nowMs = releaseSlotCollectorSlot.getNowMs();
        if (releaseDueMs <= nowMs) return true;
        OIMReleaseSlotQueueService.INSTANCE.scheduleSlotRelease(releaseSlotCollectorSlot, this, slot, nowMs);
        return false;
    }

    public cancelSlotRelease(releaseSlotCollectorSlot: TOIMReleaseSlotCollectorSlot, slot: TOIMSlot): void {
        if (this.getReleaseDueMs(slot) < 0) return;
        OIMReleaseSlotQueueService.INSTANCE.cancelSlotRelease(releaseSlotCollectorSlot, slot);
    }

    public scheduleNextRelease(releaseSlotCollectorSlot: TOIMReleaseSlotCollectorSlot): void {
        const nextSliceNumber = OIMReleaseSlotQueueService.INSTANCE.getNextReleaseSliceNumber(releaseSlotCollectorSlot);
        if (nextSliceNumber === undefined) return;
        const nowMs = releaseSlotCollectorSlot.getNowMs();
        const untilMs = Math.max(nowMs, (nextSliceNumber + 1) * OIM_SLICE_LENGTH_MS);
        if (this.isScheduled(releaseSlotCollectorSlot)) {
            if (untilMs >= releaseSlotCollectorSlot.scheduledUntilMs) return;
            this.cancelSchedule(releaseSlotCollectorSlot);
        }
        releaseSlotCollectorSlot.scheduledUntilMs = untilMs;
        this.schedule(releaseSlotCollectorSlot, untilMs - nowMs);
    }

    protected override cancelSchedule(releaseSlotCollectorSlot: TOIMReleaseSlotCollectorSlot): void {
        releaseSlotCollectorSlot.scheduledUntilMs = Number.POSITIVE_INFINITY;
        super.cancelSchedule(releaseSlotCollectorSlot);
    }

    public flush(releaseSlotCollectorSlot: TOIMReleaseSlotCollectorSlot): void {
        this.cancelSchedule(releaseSlotCollectorSlot);
        try {
            OIMReleaseSlotQueueService.INSTANCE.releaseDueUpToSliceNumber(
                releaseSlotCollectorSlot, this, oimSliceOfMs(releaseSlotCollectorSlot.getNowMs()),
            );
        } finally {
            this.scheduleNextRelease(releaseSlotCollectorSlot);
        }
    }

    protected override onSchedulerTimerFired(releaseSlotCollectorSlot: TOIMReleaseSlotCollectorSlot): void {
        try {
            this.flush(releaseSlotCollectorSlot);
        } catch (error) {
            releaseSlotCollectorSlot.errorPolicy.onErrorCaught(error);
        }
    }

    public cancelAllSlotReleases(releaseSlotCollectorSlot: TOIMReleaseSlotCollectorSlot): void {
        this.cancelSchedule(releaseSlotCollectorSlot);
        OIMReleaseSlotQueueService.INSTANCE.cancelAllSlotReleases(releaseSlotCollectorSlot);
    }
}

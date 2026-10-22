import type { TOIMSlot } from '../slot/types/TOIMSlot';
import type { TOIMReleaseSlotCollectorSlot } from './types/TOIMReleaseSlotCollectorSlot';
import type { OIMReleaseSlotCollectorService } from './OIMReleaseSlotCollectorService';
import { oimSliceOfMs } from './utils/oimSliceOfMs';
import { oimIsSlotReleased } from '../slot/utils/oimIsSlotReleased';

export class OIMReleaseSlotQueueService {
    public static readonly INSTANCE = new OIMReleaseSlotQueueService();

    public scheduleSlotRelease(
        releaseSlotCollectorSlot: TOIMReleaseSlotCollectorSlot, releaseSlotCollectorService: OIMReleaseSlotCollectorService,
        slot: TOIMSlot, nowMs: number,
    ): void {
        const releaseDueMs = releaseSlotCollectorService.getReleaseDueMs(slot);
        if (releaseDueMs < 0) return;
        const queuedSliceNumber = releaseSlotCollectorSlot.sliceNumberBySlot.get(slot);
        if (queuedSliceNumber !== undefined && queuedSliceNumber <= oimSliceOfMs(releaseDueMs)) return;
        this.addToSliceNumber(releaseSlotCollectorSlot, oimSliceOfMs(Math.max(releaseDueMs, nowMs)), slot);
        releaseSlotCollectorService.scheduleNextRelease(releaseSlotCollectorSlot);
    }

    public cancelSlotRelease(releaseSlotCollectorSlot: TOIMReleaseSlotCollectorSlot, slot: TOIMSlot): void {
        const sliceNumber = releaseSlotCollectorSlot.sliceNumberBySlot.get(slot);
        if (sliceNumber === undefined) return;
        releaseSlotCollectorSlot.sliceNumberBySlot.delete(slot);
        this.removeFromSliceNumber(releaseSlotCollectorSlot, sliceNumber, slot);
    }

    public getNextReleaseSliceNumber(releaseSlotCollectorSlot: TOIMReleaseSlotCollectorSlot): number | undefined {
        if (releaseSlotCollectorSlot.nextSliceNumberNeedsRescan) {
            let nextSliceNumber: number | undefined;
            for (const sliceNumber of releaseSlotCollectorSlot.slotsBySliceNumber.keys()) {
                if (nextSliceNumber === undefined || sliceNumber < nextSliceNumber) nextSliceNumber = sliceNumber;
            }
            releaseSlotCollectorSlot.nextSliceNumber = nextSliceNumber;
            releaseSlotCollectorSlot.nextSliceNumberNeedsRescan = false;
        }
        return releaseSlotCollectorSlot.nextSliceNumber;
    }

    public cancelAllSlotReleases(releaseSlotCollectorSlot: TOIMReleaseSlotCollectorSlot): void {
        releaseSlotCollectorSlot.slotsBySliceNumber.clear();
        releaseSlotCollectorSlot.sliceNumberBySlot.clear();
        releaseSlotCollectorSlot.nextSliceNumber = undefined;
        releaseSlotCollectorSlot.nextSliceNumberNeedsRescan = false;
    }

    public isSlotReleaseScheduled(releaseSlotCollectorSlot: TOIMReleaseSlotCollectorSlot, slot: TOIMSlot): boolean {
        return releaseSlotCollectorSlot.sliceNumberBySlot.has(slot);
    }

    public releaseDueUpToSliceNumber(
        releaseSlotCollectorSlot: TOIMReleaseSlotCollectorSlot, releaseSlotCollectorService: OIMReleaseSlotCollectorService,
        upToSliceNumber: number,
    ): void {
        const nextSliceNumber = this.getNextReleaseSliceNumber(releaseSlotCollectorSlot);
        if (nextSliceNumber === undefined || nextSliceNumber > upToSliceNumber) return;
        const outerFloor = releaseSlotCollectorSlot.floorSliceNumber;
        releaseSlotCollectorSlot.floorSliceNumber = upToSliceNumber + 1;
        const slotsBySliceNumber = releaseSlotCollectorSlot.slotsBySliceNumber;
        try {
            if (upToSliceNumber - nextSliceNumber < slotsBySliceNumber.size) {
                for (let sliceNumber = nextSliceNumber; sliceNumber <= upToSliceNumber; sliceNumber++) {
                    const sliceSlots = slotsBySliceNumber.get(sliceNumber);
                    if (sliceSlots !== undefined) this.releaseSlice(releaseSlotCollectorSlot, releaseSlotCollectorService, sliceNumber, sliceSlots);
                }
            } else {
                for (const [sliceNumber, sliceSlots] of slotsBySliceNumber) {
                    if (sliceNumber <= upToSliceNumber) this.releaseSlice(releaseSlotCollectorSlot, releaseSlotCollectorService, sliceNumber, sliceSlots);
                }
            }
        } finally {
            releaseSlotCollectorSlot.floorSliceNumber = outerFloor;
        }
    }

    private releaseSlice(
        releaseSlotCollectorSlot: TOIMReleaseSlotCollectorSlot, releaseSlotCollectorService: OIMReleaseSlotCollectorService,
        sliceNumber: number, sliceSlots: Set<TOIMSlot>,
    ): void {
        releaseSlotCollectorSlot.slotsBySliceNumber.delete(sliceNumber);
        this.invalidateNextSliceNumber(releaseSlotCollectorSlot, sliceNumber);
        const nowMs = releaseSlotCollectorSlot.getNowMs();
        const sliceNumberBySlot = releaseSlotCollectorSlot.sliceNumberBySlot;
        try {
            for (const slot of sliceSlots) {
                sliceSlots.delete(slot);
                if (sliceNumberBySlot.get(slot) === sliceNumber) sliceNumberBySlot.delete(slot);
                if (oimIsSlotReleased(slot)) continue;
                const releaseDueMs = releaseSlotCollectorService.getReleaseDueMs(slot);
                if (releaseDueMs < 0) continue;
                if (releaseDueMs > nowMs) {
                    this.addToSliceNumber(releaseSlotCollectorSlot, oimSliceOfMs(releaseDueMs), slot);
                    continue;
                }
                slot.owner.releaseSlotIfUnheld(slot);
            }
        } finally {
            if (sliceSlots.size !== 0) {
                releaseSlotCollectorSlot.slotsBySliceNumber.set(sliceNumber, sliceSlots);
                this.updateNextSliceNumber(releaseSlotCollectorSlot, sliceNumber);
            }
        }
    }

    private removeFromSliceNumber(releaseSlotCollectorSlot: TOIMReleaseSlotCollectorSlot, sliceNumber: number, slot: TOIMSlot): void {
        const sliceSlots = releaseSlotCollectorSlot.slotsBySliceNumber.get(sliceNumber);
        if (sliceSlots === undefined) return;
        sliceSlots.delete(slot);
        if (sliceSlots.size !== 0) return;
        releaseSlotCollectorSlot.slotsBySliceNumber.delete(sliceNumber);
        this.invalidateNextSliceNumber(releaseSlotCollectorSlot, sliceNumber);
    }

    private updateNextSliceNumber(releaseSlotCollectorSlot: TOIMReleaseSlotCollectorSlot, sliceNumber: number): void {
        const nextSliceNumber = releaseSlotCollectorSlot.nextSliceNumber;
        if (nextSliceNumber === undefined || sliceNumber <= nextSliceNumber) {
            releaseSlotCollectorSlot.nextSliceNumber = sliceNumber;
            releaseSlotCollectorSlot.nextSliceNumberNeedsRescan = false;
        }
    }

    private invalidateNextSliceNumber(releaseSlotCollectorSlot: TOIMReleaseSlotCollectorSlot, sliceNumber: number): void {
        if (sliceNumber === releaseSlotCollectorSlot.nextSliceNumber) releaseSlotCollectorSlot.nextSliceNumberNeedsRescan = true;
    }

    private addToSliceNumber(releaseSlotCollectorSlot: TOIMReleaseSlotCollectorSlot, sliceNumber: number, slot: TOIMSlot): void {
        const flooredSliceNumber = Math.max(sliceNumber, releaseSlotCollectorSlot.floorSliceNumber);
        const sliceNumberBySlot = releaseSlotCollectorSlot.sliceNumberBySlot;
        const prevSliceNumber = sliceNumberBySlot.get(slot);
        if (prevSliceNumber !== undefined) this.removeFromSliceNumber(releaseSlotCollectorSlot, prevSliceNumber, slot);
        const slotsBySliceNumber = releaseSlotCollectorSlot.slotsBySliceNumber;
        let sliceSlots = slotsBySliceNumber.get(flooredSliceNumber);
        if (sliceSlots === undefined) { sliceSlots = new Set(); slotsBySliceNumber.set(flooredSliceNumber, sliceSlots); }
        sliceSlots.add(slot);
        sliceNumberBySlot.set(slot, flooredSliceNumber);
        this.updateNextSliceNumber(releaseSlotCollectorSlot, flooredSliceNumber);
    }
}

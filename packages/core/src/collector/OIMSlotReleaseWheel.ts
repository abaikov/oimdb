import type { TOIMSlot } from '../slot/types/TOIMSlot';
import type { TOIMEditable } from '../slot/types/TOIMEditable';
import type { TOIMSlotReleaseWheelOptions } from './types/TOIMSlotReleaseWheelOptions';
import { OIMSlotWheel } from './OIMSlotWheel';
import { getOIMSliceOfMs } from './utils/getOIMSliceOfMs';
import { isOIMSlotReleased } from '../slot/utils/isOIMSlotReleased';

export class OIMSlotReleaseWheel extends OIMSlotWheel {
    public readonly getReleaseDueMs: (slot: TOIMSlot) => number;

    private readonly setReleaseDueMs: (slot: TOIMSlot, releaseDueMs: number) => void;

    private readonly releaseScheduledSlotFlag: number;

    public constructor(options: TOIMSlotReleaseWheelOptions) {
        super(options);
        this.getReleaseDueMs = options.getReleaseDueMs;
        this.setReleaseDueMs = options.setReleaseDueMs;
        this.releaseScheduledSlotFlag = options.releaseScheduledSlotFlag;
    }

    public markSlotReleaseDue(slot: TOIMSlot, keepMs: number): number {
        const nowMs = this.getNowMs();
        this.setReleaseDueMs(slot, nowMs + keepMs);
        return nowMs;
    }

    public markSlotReleaseDueNow(slot: TOIMSlot): void {
        this.setReleaseDueMs(slot, this.getNowMs());
        slot.owner.releaseSlotIfUnheld(slot);
    }

    public scheduleSlotRelease(slot: TOIMSlot, nowMs: number): void {
        const releaseDueMs = this.getReleaseDueMs(slot);
        if (releaseDueMs < 0) return;
        if ((slot.slotFlags & this.releaseScheduledSlotFlag) !== 0) return;
        this.fileReleaseSlot(getOIMSliceOfMs(Math.max(releaseDueMs, nowMs)), slot);
        this.scheduleNextSweep();
    }

    public isSlotReleasable(slot: TOIMSlot): boolean {
        const releaseDueMs = this.getReleaseDueMs(slot);
        if (releaseDueMs < 0) return false;
        const nowMs = this.getNowMs();
        if (releaseDueMs <= nowMs) return true;
        this.scheduleSlotRelease(slot, nowMs);
        return false;
    }

    public cancelSlotRelease(slot: TOIMSlot): void {
        if (this.getReleaseDueMs(slot) < 0) return;
        (slot as TOIMEditable<TOIMSlot>).slotFlags &= ~this.releaseScheduledSlotFlag;
    }

    public isSlotReleaseScheduled(slot: TOIMSlot): boolean {
        return (slot.slotFlags & this.releaseScheduledSlotFlag) !== 0;
    }

    protected onSlotDue(slot: TOIMSlot, nowMs: number): void {
        const slotFlags = slot.slotFlags;
        if ((slotFlags & this.releaseScheduledSlotFlag) === 0) return;
        (slot as TOIMEditable<TOIMSlot>).slotFlags = slotFlags & ~this.releaseScheduledSlotFlag;
        if (isOIMSlotReleased(slot)) return;
        const releaseDueMs = this.getReleaseDueMs(slot);
        if (releaseDueMs < 0) return;
        if (releaseDueMs > nowMs) {
            this.fileReleaseSlot(getOIMSliceOfMs(releaseDueMs), slot);
            return;
        }
        slot.owner.releaseSlotIfUnheld(slot);
    }

    protected override onSlotDropped(slot: TOIMSlot): void {
        (slot as TOIMEditable<TOIMSlot>).slotFlags &= ~this.releaseScheduledSlotFlag;
    }

    private fileReleaseSlot(sliceNumber: number, slot: TOIMSlot): void {
        this.fileSlot(sliceNumber, slot);
        (slot as TOIMEditable<TOIMSlot>).slotFlags |= this.releaseScheduledSlotFlag;
    }
}

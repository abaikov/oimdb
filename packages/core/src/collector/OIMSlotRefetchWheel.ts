import type { TOIMSlot } from '../slot/types/TOIMSlot';
import type { IOIMSlotRefetchListener } from './interfaces/IOIMSlotRefetchListener';
import type { TOIMSlotRefetchWheelOptions } from './types/TOIMSlotRefetchWheelOptions';
import { OIMSlotWheel } from './OIMSlotWheel';
import { oimSliceOfMs } from './utils/oimSliceOfMs';
import { oimIsSlotReleased } from '../slot/utils/oimIsSlotReleased';
import type { OIMDB } from '../db/OIMDB';

export class OIMSlotRefetchWheel extends OIMSlotWheel {
    private readonly slotRefetchListener: IOIMSlotRefetchListener;

    private readonly refetchDueSlots: TOIMSlot[] = [];

    public constructor(db: OIMDB, options: TOIMSlotRefetchWheelOptions) {
        super(db.collectorSlot.slotWheelOptions);
        this.slotRefetchListener = options.slotRefetchListener;
    }

    public scheduleSlotRefetchAt(slot: TOIMSlot, atMs: number): void {
        this.fileSlot(oimSliceOfMs(atMs), slot);
        this.scheduleNextSweep();
    }

    protected override getSweptSliceNumberAt(nowMs: number): number {
        return oimSliceOfMs(nowMs) - 1;
    }

    protected onSlotDue(slot: TOIMSlot): void {
        if (oimIsSlotReleased(slot)) return;
        if (slot.effects === undefined || slot.effects.length === 0) return;
        this.refetchDueSlots.push(slot);
    }

    protected override onSweepFinished(): void {
        const refetchDueSlots = this.refetchDueSlots;
        if (refetchDueSlots.length === 0) return;
        try {
            this.slotRefetchListener.onSlotsRefetchDue(refetchDueSlots);
        } finally {
            refetchDueSlots.length = 0;
        }
    }
}

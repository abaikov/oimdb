import type { TOIMSlot } from '../slot/types/TOIMSlot';
import type { IOIMSlotRefetchListener } from './interfaces/IOIMSlotRefetchListener';
import type { TOIMSlotRefetchWheelOptions } from './types/TOIMSlotRefetchWheelOptions';
import { OIMSlotWheel } from './OIMSlotWheel';
import { getOIMSliceOfMs } from './utils/getOIMSliceOfMs';
import { isOIMSlotReleased } from '../slot/utils/isOIMSlotReleased';
import type { OIMDB } from '../db/OIMDB';

export class OIMSlotRefetchWheel extends OIMSlotWheel {
    private readonly slotRefetchListener: IOIMSlotRefetchListener;

    private readonly refetchDueSlots: TOIMSlot[] = [];

    public constructor(db: OIMDB, options: TOIMSlotRefetchWheelOptions) {
        super(db.collectorSlot.slotWheelOptions);
        this.slotRefetchListener = options.slotRefetchListener;
    }

    public scheduleSlotRefetchAt(slot: TOIMSlot, atMs: number): void {
        this.fileSlot(getOIMSliceOfMs(atMs), slot);
        this.scheduleNextSweep();
    }

    protected override getSweptSliceNumberAt(nowMs: number): number {
        return getOIMSliceOfMs(nowMs) - 1;
    }

    protected onSlotDue(slot: TOIMSlot): void {
        if (!isOIMSlotReleased(slot)) this.refetchDueSlots.push(slot);
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

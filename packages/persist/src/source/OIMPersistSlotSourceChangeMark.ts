import type { TOIMSlot } from '@oimdb/core';
import { holdOIMSlots, isOIMAnySlotChangedAfter, unholdOIMSlotsIfAlive } from '@oimdb/core';
import type { IOIMPersistSourceChangeMark } from './interfaces/IOIMPersistSourceChangeMark';
import type { TOIMPersistSourceChangeMarkSlotDrivenOptions } from './types/TOIMPersistSourceChangeMarkSlotDrivenOptions';

export class OIMPersistSlotSourceChangeMark implements IOIMPersistSourceChangeMark {
    private readonly slots: TOIMSlot[];
    private readonly markedAtRevision: number;
    private readonly markedAtEpoch: number;

    public constructor(persistSourceChangeMarkSlotDrivenOptions: TOIMPersistSourceChangeMarkSlotDrivenOptions) {
        const channelClock = persistSourceChangeMarkSlotDrivenOptions.channelClock;
        this.markedAtRevision = channelClock.revision;
        this.markedAtEpoch = channelClock.epoch;
        this.slots = Array.from(persistSourceChangeMarkSlotDrivenOptions.slots);
        holdOIMSlots(this.slots);
    }

    public isSourceChangedSinceMark(): boolean {
        return isOIMAnySlotChangedAfter(this.slots, this.markedAtRevision, this.markedAtEpoch);
    }

    public dispose(): void {
        const slots = this.slots;
        unholdOIMSlotsIfAlive(slots);
        slots.length = 0;
    }
}

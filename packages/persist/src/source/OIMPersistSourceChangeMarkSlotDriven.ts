import type { TOIMSlot } from '@oimdb/core';
import { oimHoldSlots, oimIsAnySlotChangedAfter, oimUnholdSlotsIfAlive } from '@oimdb/core';
import type { IOIMPersistSourceChangeMark } from './interfaces/IOIMPersistSourceChangeMark';
import type { TOIMPersistSourceChangeMarkSlotDrivenOptions } from './types/TOIMPersistSourceChangeMarkSlotDrivenOptions';

export class OIMPersistSourceChangeMarkSlotDriven implements IOIMPersistSourceChangeMark {
    private readonly slots: TOIMSlot[];
    private readonly markedAtRevision: number;
    private readonly markedAtEpoch: number;

    public constructor(persistSourceChangeMarkSlotDrivenOptions: TOIMPersistSourceChangeMarkSlotDrivenOptions) {
        const channelClock = persistSourceChangeMarkSlotDrivenOptions.channelClock;
        this.markedAtRevision = channelClock.revision;
        this.markedAtEpoch = channelClock.epoch;
        this.slots = Array.from(persistSourceChangeMarkSlotDrivenOptions.slots);
        oimHoldSlots(this.slots);
    }

    public isSourceChangedSinceMark(): boolean {
        return oimIsAnySlotChangedAfter(this.slots, this.markedAtRevision, this.markedAtEpoch);
    }

    public dispose(): void {
        const slots = this.slots;
        oimUnholdSlotsIfAlive(slots);
        slots.length = 0;
    }
}

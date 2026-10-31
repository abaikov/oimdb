import type { IOIMSlotOwner } from './interfaces/IOIMSlotOwner';
import type { TOIMEffect } from '../effect/types/TOIMEffect';
import type { TOIMStoreSlot } from './types/TOIMStoreSlot';
import { OIM_SLOT_FLAG_EMPTY } from './constants/OIM_SLOT_FLAG_EMPTY';

export abstract class OIMSlot {
    public effects: TOIMEffect[] | undefined;

    public changedAtRevision: number;

    public changedAtEpoch: number;

    public effectEdges: number[] | undefined;

    public holdCount: number;

    public releaseDueAfterWriteMs: number;

    public releaseDueAfterIdleMs: number;

    public releaseDueAfterUnholdMs: number;

    public slotFlags: number;

    public columnSlotStore: unknown;

    public storeSlot: TOIMStoreSlot;

    public owner: IOIMSlotOwner;

    protected constructor(owner: IOIMSlotOwner, storeSlot: TOIMStoreSlot) {
        this.effects = undefined;
        this.changedAtRevision = 0;
        this.changedAtEpoch = 0;
        this.effectEdges = undefined;
        this.holdCount = 0;
        this.releaseDueAfterWriteMs = -1;
        this.releaseDueAfterIdleMs = -1;
        this.releaseDueAfterUnholdMs = -1;
        this.slotFlags = OIM_SLOT_FLAG_EMPTY;
        this.columnSlotStore = undefined;
        this.storeSlot = storeSlot;
        this.owner = owner;
    }

    public holdSlot(): void {
        this.owner.holdSlot(this);
    }

    public unholdSlot(): void {
        this.owner.unholdSlot(this);
    }
}

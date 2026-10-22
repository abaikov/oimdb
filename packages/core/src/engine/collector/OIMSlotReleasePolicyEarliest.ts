import type { IOIMSlotReleasePolicy } from './interfaces/IOIMSlotReleasePolicy';
import type { TOIMSlot } from '../slot/types/TOIMSlot';

const askOnSlotIdle = (slotReleasePolicy: IOIMSlotReleasePolicy, slot: TOIMSlot): boolean =>
    slotReleasePolicy.onSlotIdle(slot);

const askIsSlotReleasable = (slotReleasePolicy: IOIMSlotReleasePolicy, slot: TOIMSlot): boolean =>
    slotReleasePolicy.isSlotReleasable(slot);

const askIsEmptySlotReleasable = (slotReleasePolicy: IOIMSlotReleasePolicy, slot: TOIMSlot): boolean =>
    slotReleasePolicy.isEmptySlotReleasable(slot);

export class OIMSlotReleasePolicyEarliest implements IOIMSlotReleasePolicy {
    public readonly releasesWrittenSlots: boolean;

    public readonly schedulesReleaseOnWrite: boolean;

    private readonly slotReleasePolicies: readonly IOIMSlotReleasePolicy[];

    public constructor(slotReleasePolicies: readonly IOIMSlotReleasePolicy[]) {
        this.slotReleasePolicies = slotReleasePolicies;
        let releasesWrittenSlots = false;
        let schedulesReleaseOnWrite = false;
        for (let i = 0; i < slotReleasePolicies.length; i++) {
            if (slotReleasePolicies[i].releasesWrittenSlots) releasesWrittenSlots = true;
            if (slotReleasePolicies[i].schedulesReleaseOnWrite) schedulesReleaseOnWrite = true;
        }
        this.releasesWrittenSlots = releasesWrittenSlots;
        this.schedulesReleaseOnWrite = schedulesReleaseOnWrite;
    }

    public onSlotWritten(slot: TOIMSlot): void {
        const slotReleasePolicies = this.slotReleasePolicies;
        for (let i = 0; i < slotReleasePolicies.length; i++) slotReleasePolicies[i].onSlotWritten(slot);
    }

    public onSlotIdle(slot: TOIMSlot): boolean {
        return this.isAnySlotReleasePolicyDue(slot, askOnSlotIdle);
    }

    public onSlotUnheld(slot: TOIMSlot): void {
        const slotReleasePolicies = this.slotReleasePolicies;
        for (let i = 0; i < slotReleasePolicies.length; i++) slotReleasePolicies[i].onSlotUnheld(slot);
    }

    public isSlotReleasable(slot: TOIMSlot): boolean {
        return this.isAnySlotReleasePolicyDue(slot, askIsSlotReleasable);
    }

    public isEmptySlotReleasable(slot: TOIMSlot): boolean {
        return this.isAnySlotReleasePolicyDue(slot, askIsEmptySlotReleasable);
    }

    public cancelSlotRelease(slot: TOIMSlot): void {
        const slotReleasePolicies = this.slotReleasePolicies;
        for (let i = 0; i < slotReleasePolicies.length; i++) slotReleasePolicies[i].cancelSlotRelease(slot);
    }

    private isAnySlotReleasePolicyDue(
        slot: TOIMSlot, askSlotReleasePolicy: (slotReleasePolicy: IOIMSlotReleasePolicy, slot: TOIMSlot) => boolean,
    ): boolean {
        const slotReleasePolicies = this.slotReleasePolicies;
        let isDue = false;
        for (let i = 0; i < slotReleasePolicies.length; i++) {
            if (askSlotReleasePolicy(slotReleasePolicies[i], slot)) isDue = true;
        }
        return isDue;
    }
}

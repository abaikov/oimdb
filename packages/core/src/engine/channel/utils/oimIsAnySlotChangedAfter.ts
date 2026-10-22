import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import { oimIsRevisionAfter } from './oimIsRevisionAfter';

export function oimIsAnySlotChangedAfter(slots: readonly TOIMSlot[], revision: number, epoch: number): boolean {
    for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        if (oimIsRevisionAfter(slot.changedAtRevision, slot.changedAtEpoch, revision, epoch)) return true;
    }
    return false;
}

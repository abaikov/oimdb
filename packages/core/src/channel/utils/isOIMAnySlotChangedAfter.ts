import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import { isOIMRevisionAfter } from './isOIMRevisionAfter';

export function isOIMAnySlotChangedAfter(slots: readonly TOIMSlot[], revision: number, epoch: number): boolean {
    for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        if (isOIMRevisionAfter(slot.changedAtRevision, slot.changedAtEpoch, revision, epoch)) return true;
    }
    return false;
}

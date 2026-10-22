import type { TOIMSlot } from '../types/TOIMSlot';
import { OIM_SLOT_FLAG_RELEASED } from '../constants/OIM_SLOT_FLAG_RELEASED';

export function oimUnholdSlotIfAlive(slot: TOIMSlot): void {
    if ((slot.slotFlags & OIM_SLOT_FLAG_RELEASED) === 0) slot.owner.unholdSlot(slot);
}

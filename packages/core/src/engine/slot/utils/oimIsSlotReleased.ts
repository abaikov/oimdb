import type { TOIMSlot } from '../types/TOIMSlot';
import { OIM_SLOT_FLAG_RELEASED } from '../constants/OIM_SLOT_FLAG_RELEASED';

export function oimIsSlotReleased(slot: TOIMSlot): boolean {
    return (slot.slotFlags & OIM_SLOT_FLAG_RELEASED) !== 0;
}

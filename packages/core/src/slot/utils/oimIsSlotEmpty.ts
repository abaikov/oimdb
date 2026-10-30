import type { TOIMSlot } from '../types/TOIMSlot';
import { OIM_SLOT_FLAG_EMPTY } from '../constants/OIM_SLOT_FLAG_EMPTY';

export function oimIsSlotEmpty(slot: TOIMSlot): boolean {
    return (slot.slotFlags & OIM_SLOT_FLAG_EMPTY) !== 0;
}

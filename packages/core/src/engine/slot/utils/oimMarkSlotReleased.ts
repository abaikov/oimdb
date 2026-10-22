import type { TOIMSlot } from '../types/TOIMSlot';
import type { TOIMSlotEditable } from '../types/TOIMSlotEditable';
import { OIM_SLOT_FLAG_RELEASED } from '../constants/OIM_SLOT_FLAG_RELEASED';

export function oimMarkSlotReleased(slot: TOIMSlot): void {
    (slot as TOIMSlotEditable<TOIMSlot>).slotFlags |= OIM_SLOT_FLAG_RELEASED;
}

import type { TOIMSlot } from '../types/TOIMSlot';
import type { TOIMEditable } from '../types/TOIMEditable';
import { OIM_SLOT_FLAG_RELEASED } from '../constants/OIM_SLOT_FLAG_RELEASED';

export function oimMarkSlotReleased(slot: TOIMSlot): void {
    (slot as TOIMEditable<TOIMSlot>).slotFlags |= OIM_SLOT_FLAG_RELEASED;
}

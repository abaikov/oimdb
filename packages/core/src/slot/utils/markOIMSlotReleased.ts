import type { TOIMSlot } from '../types/TOIMSlot';
import type { TOIMEditable } from '../types/TOIMEditable';
import { OIM_SLOT_FLAG_RELEASED } from '../constants/OIM_SLOT_FLAG_RELEASED';
import { peekOIMChannelSlot } from './peekOIMChannelSlot';

export function markOIMSlotReleased(slot: TOIMSlot): void {
    (slot as TOIMEditable<TOIMSlot>).slotFlags |= OIM_SLOT_FLAG_RELEASED;
    const slotReleaseListeners = peekOIMChannelSlot(slot).collectorSlot.slotReleaseListeners;
    for (let i = 0; i < slotReleaseListeners.length; i++) slotReleaseListeners[i].onSlotReleased(slot);
}

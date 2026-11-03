import type { TOIMSlot } from '../types/TOIMSlot';

export function holdOIMSlots(slots: readonly TOIMSlot[]): void {
    for (let i = 0; i < slots.length; i++) slots[i].owner.holdSlot(slots[i]);
}

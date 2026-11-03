import type { TOIMSlot } from '../types/TOIMSlot';
import { unholdOIMSlotIfAlive } from './unholdOIMSlotIfAlive';

export function unholdOIMSlotsIfAlive(slots: readonly TOIMSlot[]): void {
    for (let i = 0; i < slots.length; i++) unholdOIMSlotIfAlive(slots[i]);
}

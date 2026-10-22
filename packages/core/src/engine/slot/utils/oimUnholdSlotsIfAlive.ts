import type { TOIMSlot } from '../types/TOIMSlot';
import { oimUnholdSlotIfAlive } from './oimUnholdSlotIfAlive';

export function oimUnholdSlotsIfAlive(slots: readonly TOIMSlot[]): void {
    for (let i = 0; i < slots.length; i++) oimUnholdSlotIfAlive(slots[i]);
}

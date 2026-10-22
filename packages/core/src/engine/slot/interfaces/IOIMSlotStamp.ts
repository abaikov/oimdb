import type { TOIMSlotEditable } from '../types/TOIMSlotEditable';

export interface IOIMSlotStamp<TSlot> {
    stamp(slotEditable: TOIMSlotEditable<TSlot>): void;
}

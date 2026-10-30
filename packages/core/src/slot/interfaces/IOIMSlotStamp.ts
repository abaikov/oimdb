import type { TOIMEditable } from '../types/TOIMEditable';

export interface IOIMSlotStamp<TSlot> {
    stamp(editableSlot: TOIMEditable<TSlot>): void;
}

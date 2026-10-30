import type { TOIMSlot } from '../types/TOIMSlot';

export interface IOIMSlotContentWriter<TSlot extends TOIMSlot, TContent> {
    insertSlotContent(slot: TSlot, content: TContent, changedSlots?: TSlot[]): void;
    writeSlotContent(slot: TSlot, content: TContent): boolean;
    clearSlotContent(slot: TSlot): void;
}

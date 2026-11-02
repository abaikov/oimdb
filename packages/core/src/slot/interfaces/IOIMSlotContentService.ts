import type { TOIMSlot } from '../types/TOIMSlot';

export interface IOIMSlotContentService<TSlot extends TOIMSlot> {
    isSlotEmpty(slot: TSlot): boolean;
    releaseSlotContent(slot: TSlot): void;
}

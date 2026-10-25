import type { TOIMSlot } from '../types/TOIMSlot';
import type { IOIMSlotOwner } from './IOIMSlotOwner';

export interface IOIMSlotContentService<TSlot extends TOIMSlot, TSlotOwnerService extends IOIMSlotOwner = IOIMSlotOwner> {
    isSlotEmpty(slot: TSlot): boolean;
    releaseSlotContent(slot: TSlot, slotOwnerService: TSlotOwnerService): void;
    hasReference(slot: TSlot): boolean;
}

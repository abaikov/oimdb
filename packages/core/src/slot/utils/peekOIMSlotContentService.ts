import type { TOIMSlot } from '../types/TOIMSlot';
import type { IOIMSlotOwner } from '../interfaces/IOIMSlotOwner';
import type { IOIMSlotContentService } from '../interfaces/IOIMSlotContentService';

export function peekOIMSlotContentService(slot: TOIMSlot): IOIMSlotContentService<TOIMSlot> {
    return (slot.owner as IOIMSlotOwner & { readonly slotContentService: IOIMSlotContentService<TOIMSlot> }).slotContentService;
}

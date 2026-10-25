import type { TOIMEntityContentSlot } from '../types/TOIMEntityContentSlot';
import type { TOIMSlotEditable } from '../../slot/types/TOIMSlotEditable';

export function oimClearEntity(entitySlot: TOIMEntityContentSlot): void {
    (entitySlot as TOIMSlotEditable<TOIMEntityContentSlot>).entity = undefined;
}

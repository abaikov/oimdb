import type { TOIMEntitySlot } from '../types/TOIMEntitySlot';
import type { TOIMSlotEditable } from '../../slot/types/TOIMSlotEditable';

export function oimClearEntity(entitySlot: TOIMEntitySlot): void {
    (entitySlot as TOIMSlotEditable<TOIMEntitySlot>).entity = undefined;
}

import type { TOIMEntityContentSlot } from '../types/TOIMEntityContentSlot';
import type { TOIMEditable } from '../../slot/types/TOIMEditable';

export function oimClearEntity(entitySlot: TOIMEntityContentSlot): void {
    (entitySlot as TOIMEditable<TOIMEntityContentSlot>).entity = undefined;
}

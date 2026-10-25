import type { TOIMEntityContentSlot } from '../types/TOIMEntityContentSlot';
import type { TOIMSlotEditable } from '../../slot/types/TOIMSlotEditable';

export function oimInsertEntityWithoutCopy<TEntity extends object>(
    slot: TOIMEntityContentSlot<TEntity>, entity: TEntity,
): void {
    (slot as TOIMSlotEditable<TOIMEntityContentSlot<TEntity>>).entity = entity;
}

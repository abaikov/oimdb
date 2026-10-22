import type { TOIMEntitySlot } from '../types/TOIMEntitySlot';
import type { TOIMSlotEditable } from '../../slot/types/TOIMSlotEditable';

export function oimInsertEntityWithoutCopy<TEntity extends object>(
    slot: TOIMEntitySlot<TEntity>, entity: TEntity,
): void {
    (slot as TOIMSlotEditable<TOIMEntitySlot<TEntity>>).entity = entity;
}

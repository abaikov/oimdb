import type { TOIMEntitySlot } from '../types/TOIMEntitySlot';
import { oimCopyEntitySanitized } from './oimCopyEntitySanitized';
import type { TOIMSlotEditable } from '../../slot/types/TOIMSlotEditable';

export function oimInsertEntityWithSanitizedCopy<TEntity extends object>(
    slot: TOIMEntitySlot<TEntity>, entity: TEntity,
): void {
    (slot as TOIMSlotEditable<TOIMEntitySlot<TEntity>>).entity = oimCopyEntitySanitized(entity) as TEntity;
}

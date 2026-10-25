import type { TOIMEntityContentSlot } from '../types/TOIMEntityContentSlot';
import { oimCopyEntitySanitized } from './oimCopyEntitySanitized';
import type { TOIMSlotEditable } from '../../slot/types/TOIMSlotEditable';

export function oimInsertEntityWithSanitizedCopy<TEntity extends object>(
    slot: TOIMEntityContentSlot<TEntity>, entity: TEntity,
): void {
    (slot as TOIMSlotEditable<TOIMEntityContentSlot<TEntity>>).entity = oimCopyEntitySanitized(entity) as TEntity;
}

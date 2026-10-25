import type { TOIMEntityContentSlot } from '../types/TOIMEntityContentSlot';
import { oimCopyEntity } from './oimCopyEntity';
import type { TOIMSlotEditable } from '../../slot/types/TOIMSlotEditable';

export function oimInsertEntityWithCopy<TEntity extends object>(
    slot: TOIMEntityContentSlot<TEntity>, entity: TEntity,
): void {
    (slot as TOIMSlotEditable<TOIMEntityContentSlot<TEntity>>).entity = oimCopyEntity(entity) as TEntity;
}

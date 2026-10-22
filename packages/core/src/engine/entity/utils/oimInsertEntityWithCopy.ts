import type { TOIMEntitySlot } from '../types/TOIMEntitySlot';
import { oimCopyEntity } from './oimCopyEntity';
import type { TOIMSlotEditable } from '../../slot/types/TOIMSlotEditable';

export function oimInsertEntityWithCopy<TEntity extends object>(
    slot: TOIMEntitySlot<TEntity>, entity: TEntity,
): void {
    (slot as TOIMSlotEditable<TOIMEntitySlot<TEntity>>).entity = oimCopyEntity(entity) as TEntity;
}

import type { TOIMEntityContentSlot } from '../types/TOIMEntityContentSlot';
import { oimCopyEntity } from './oimCopyEntity';
import type { TOIMEditable } from '../../slot/types/TOIMEditable';

export function oimInsertEntityWithCopy<TEntity extends object>(
    slot: TOIMEntityContentSlot<TEntity>, entity: TEntity,
): void {
    (slot as TOIMEditable<TOIMEntityContentSlot<TEntity>>).entity = oimCopyEntity(entity) as TEntity;
}

import type { TOIMEntityContentSlot } from '../types/TOIMEntityContentSlot';
import { oimSanitizedCopyEntity } from './oimSanitizedCopyEntity';
import type { TOIMEditable } from '../../slot/types/TOIMEditable';

export function oimInsertEntityWithSanitizedCopy<TEntity extends object>(
    slot: TOIMEntityContentSlot<TEntity>, entity: TEntity,
): void {
    (slot as TOIMEditable<TOIMEntityContentSlot<TEntity>>).entity = oimSanitizedCopyEntity(entity) as TEntity;
}

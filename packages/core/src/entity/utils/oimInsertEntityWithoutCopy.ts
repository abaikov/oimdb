import type { TOIMEntityContentSlot } from '../types/TOIMEntityContentSlot';
import type { TOIMEditable } from '../../slot/types/TOIMEditable';

export function oimInsertEntityWithoutCopy<TEntity extends object>(
    slot: TOIMEntityContentSlot<TEntity>, entity: TEntity,
): void {
    (slot as TOIMEditable<TOIMEntityContentSlot<TEntity>>).entity = entity;
}

import type { OIMEntitySlot } from '../OIMEntitySlot';
import { oimCopyEntity } from './oimCopyEntity';
import type { TOIMEditable } from '../../slot/types/TOIMEditable';

export function oimInsertEntityWithCopy<TEntity extends object>(
    slot: OIMEntitySlot<TEntity>, entity: TEntity,
): void {
    (slot as TOIMEditable<OIMEntitySlot<TEntity>>).content = oimCopyEntity(entity) as TEntity;
}

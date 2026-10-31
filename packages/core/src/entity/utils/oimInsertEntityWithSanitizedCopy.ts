import type { OIMEntitySlot } from '../OIMEntitySlot';
import { oimSanitizedCopyEntity } from './oimSanitizedCopyEntity';
import type { TOIMEditable } from '../../slot/types/TOIMEditable';

export function oimInsertEntityWithSanitizedCopy<TEntity extends object>(
    slot: OIMEntitySlot<TEntity>, entity: TEntity,
): void {
    (slot as TOIMEditable<OIMEntitySlot<TEntity>>).content = oimSanitizedCopyEntity(entity) as TEntity;
}

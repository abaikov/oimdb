import type { OIMEntitySlot } from '../OIMEntitySlot';
import type { TOIMEditable } from '../../slot/types/TOIMEditable';

export function oimInsertEntityWithoutCopy<TEntity extends object>(
    slot: OIMEntitySlot<TEntity>, entity: TEntity,
): void {
    (slot as TOIMEditable<OIMEntitySlot<TEntity>>).content = entity;
}

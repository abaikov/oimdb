import type { OIMEntitySlot } from '../OIMEntitySlot';
import { copyOIMEntity } from './copyOIMEntity';
import type { TOIMEditable } from '../../slot/types/TOIMEditable';

export function insertOIMEntityWithCopy<TEntity extends object>(
    slot: OIMEntitySlot<TEntity>, entity: TEntity,
): void {
    (slot as TOIMEditable<OIMEntitySlot<TEntity>>).content = copyOIMEntity(entity) as TEntity;
}

import type { OIMEntitySlot } from '../OIMEntitySlot';
import { copyOIMSanitizedEntity } from './copyOIMSanitizedEntity';
import type { TOIMEditable } from '../../slot/types/TOIMEditable';

export function insertOIMEntityWithSanitizedCopy<TEntity extends object>(
    slot: OIMEntitySlot<TEntity>, entity: TEntity,
): void {
    (slot as TOIMEditable<OIMEntitySlot<TEntity>>).content = copyOIMSanitizedEntity(entity) as TEntity;
}

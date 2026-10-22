import type { TOIMEntitySlot } from '../../../engine/entity/types/TOIMEntitySlot';

export function oimEntitySlotsComparator<TEntity extends object>(
    compareEntities: (left: TEntity, right: TEntity) => number,
): (leftEntitySlot: TOIMEntitySlot<TEntity>, rightEntitySlot: TOIMEntitySlot<TEntity>) => number {
    return (leftEntitySlot, rightEntitySlot) => {
        const leftEntity = leftEntitySlot.entity;
        const rightEntity = rightEntitySlot.entity;
        if (leftEntity === undefined) return rightEntity === undefined ? 0 : 1;
        if (rightEntity === undefined) return -1;
        return compareEntities(leftEntity, rightEntity);
    };
}

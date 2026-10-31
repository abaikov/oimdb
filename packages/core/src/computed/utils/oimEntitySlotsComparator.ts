import type { OIMEntitySlot } from '../../entity/OIMEntitySlot';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';

export function oimEntitySlotsComparator<TEntity extends object>(
    compareEntities: (left: TEntity, right: TEntity) => number,
): (leftEntitySlot: TOIMEntitySlot<TEntity>, rightEntitySlot: TOIMEntitySlot<TEntity>) => number {
    return (leftEntitySlot, rightEntitySlot) => {
        const leftEntity = (leftEntitySlot as unknown as OIMEntitySlot<TEntity>).content;
        const rightEntity = (rightEntitySlot as unknown as OIMEntitySlot<TEntity>).content;
        if (leftEntity === undefined) return rightEntity === undefined ? 0 : 1;
        if (rightEntity === undefined) return -1;
        return compareEntities(leftEntity, rightEntity);
    };
}

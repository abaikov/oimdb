import type { TOIMSortColumn } from '../types/TOIMSortColumn';

type TOIMSortValue = string | number | bigint | null | undefined;

export function createOIMColumnsComparator<TEntity extends object>(
    columns: readonly TOIMSortColumn<TEntity>[],
): (left: TEntity, right: TEntity) => number {
    return (left, right) => {
        for (let i = 0; i < columns.length; i++) {
            const columnName = columns[i].columnName;
            const leftValue = left[columnName] as TOIMSortValue;
            const rightValue = right[columnName] as TOIMSortValue;
            if (leftValue === rightValue) continue;
            const isLeftMissing = leftValue === undefined || leftValue === null || leftValue !== leftValue;
            const isRightMissing = rightValue === undefined || rightValue === null || rightValue !== rightValue;
            if (isLeftMissing && isRightMissing) continue;
            if (isLeftMissing) return 1;
            if (isRightMissing) return -1;
            const order = leftValue < rightValue ? -1 : 1;
            return columns[i].direction === 'desc' ? -order : order;
        }
        return 0;
    };
}

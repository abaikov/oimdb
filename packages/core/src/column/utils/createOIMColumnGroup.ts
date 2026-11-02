import type { TOIMColumnGroup } from '../types/TOIMColumnGroup';
import { oimColumnGroupKeyOfColumnNames } from './oimColumnGroupKeyOfColumnNames';

export function createOIMColumnGroup<TColumnName extends string>(columnNames: readonly TColumnName[]): TOIMColumnGroup<TColumnName> {
    if (columnNames.length === 0) {
        throw new Error(
            'createOIMColumnGroup: a column group names at least one column. A slot that hears every '
            + 'column is the any-column slot: holdAnyColumn.',
        );
    }
    const sortedColumnNames = [...new Set(columnNames)].sort();
    return Object.freeze({ key: oimColumnGroupKeyOfColumnNames(sortedColumnNames), columnNames: Object.freeze(sortedColumnNames) });
}

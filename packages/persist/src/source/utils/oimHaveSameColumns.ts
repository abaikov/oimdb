import { oimSameValueZeroGuard } from '@oimdb/core';

export function oimHaveSameColumns(storedEntity: object, currentEntity: object): boolean {
    const storedColumns = storedEntity as Record<string, unknown>;
    const currentColumns = currentEntity as Record<string, unknown>;
    let comparedColumnCount = 0;
    for (const columnName in storedColumns) {
        if (!oimSameValueZeroGuard(storedColumns[columnName], currentColumns[columnName])) return false;
        comparedColumnCount++;
    }
    return Object.keys(currentColumns).length === comparedColumnCount;
}

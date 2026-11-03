import { isOIMSameValueZero } from '@oimdb/core';

export function hasOIMSameColumns(storedEntity: object, currentEntity: object): boolean {
    const storedColumns = storedEntity as Record<string, unknown>;
    const currentColumns = currentEntity as Record<string, unknown>;
    let comparedColumnCount = 0;
    for (const columnName in storedColumns) {
        if (!isOIMSameValueZero(storedColumns[columnName], currentColumns[columnName])) return false;
        comparedColumnCount++;
    }
    return Object.keys(currentColumns).length === comparedColumnCount;
}

import { TOIMIndexedDbPrimaryKey } from '../types/TOIMIndexedDbPrimaryKey';

export function normalizePrimaryKey(
    primaryKey: TOIMIndexedDbPrimaryKey
): IDBValidKey {
    if (
        typeof primaryKey === 'string' ||
        typeof primaryKey === 'number' ||
        primaryKey instanceof Date ||
        Array.isArray(primaryKey)
    ) {
        return primaryKey as IDBValidKey;
    }
    return JSON.stringify(primaryKey);
}

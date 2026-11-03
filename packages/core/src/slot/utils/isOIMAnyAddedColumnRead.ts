import type { TOIMSlotContentChangeListenerReadColumns } from '../types/TOIMSlotContentChangeListenerReadColumns';

export function isOIMAnyAddedColumnRead(
    listenerReadColumns: TOIMSlotContentChangeListenerReadColumns, changedColumns: readonly string[] | undefined,
): boolean {
    if (listenerReadColumns.isAnyColumnAdded) return true;
    const listenerAddedColumnNames = listenerReadColumns.addedColumnNames;
    if (listenerAddedColumnNames.size === 0) return false;
    if (changedColumns === undefined) return true;
    for (let i = 0; i < changedColumns.length; i++) {
        if (listenerAddedColumnNames.has(changedColumns[i])) return true;
    }
    return false;
}

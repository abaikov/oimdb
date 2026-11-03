import type { IOIMSlotStoreService } from '../../store/interfaces/IOIMSlotStoreService';
import type { TOIMKeyedSlot } from '../../slot/types/TOIMKeyedSlot';
import type { TOIMColumnSlotOwnerOptions } from '../types/TOIMColumnSlotOwnerOptions';
import { OIMColumnSlotOrdinalStoreService } from '../OIMColumnSlotOrdinalStoreService';

export function getOIMColumnSlotStoreService<TColumnSlot extends TOIMKeyedSlot<string>>(
    columnSlotOwnerOptions: TOIMColumnSlotOwnerOptions<TColumnSlot>,
): IOIMSlotStoreService<string, TColumnSlot> {
    if (columnSlotOwnerOptions.columnNames !== undefined) {
        return new OIMColumnSlotOrdinalStoreService<TColumnSlot>({
            columnNames: columnSlotOwnerOptions.columnNames, columnGroups: columnSlotOwnerOptions.columnGroups ?? [],
        });
    }
    return columnSlotOwnerOptions.columnSlotStoreService;
}

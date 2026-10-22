import type { IOIMSlotStoreService } from '../../store/interfaces/IOIMSlotStoreService';
import type { TOIMKeyedSlot } from '../../slot/types/TOIMKeyedSlot';
import type { TOIMColumnOwnerOptions } from '../types/TOIMColumnOwnerOptions';
import { OIMColumnSlotStoreServiceOrdinalDriven } from '../OIMColumnSlotStoreServiceOrdinalDriven';

export function oimColumnSlotStoreServiceOfColumnOwnerOptions<TColumnSlot extends TOIMKeyedSlot<string>>(
    columnOwnerOptions: TOIMColumnOwnerOptions<TColumnSlot>,
): IOIMSlotStoreService<string, TColumnSlot> {
    if (columnOwnerOptions.columnNames !== undefined) {
        return new OIMColumnSlotStoreServiceOrdinalDriven<TColumnSlot>({ columnNames: columnOwnerOptions.columnNames });
    }
    return columnOwnerOptions.columnSlotStoreService;
}

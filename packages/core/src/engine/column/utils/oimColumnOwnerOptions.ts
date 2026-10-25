import type { IOIMSlotStoreService } from '../../store/interfaces/IOIMSlotStoreService';
import type { TOIMKeyedSlot } from '../../slot/types/TOIMKeyedSlot';
import type { TOIMColumnSlotOwnerOptions } from '../types/TOIMColumnSlotOwnerOptions';

export function oimColumnOwnerOptions<TColumnSlot extends TOIMKeyedSlot<string>, TColumnName extends string>(
    columnSlotOwnerOptions:
        | TOIMColumnSlotOwnerOptions<TColumnSlot, TColumnName>
        | { columnSlotStoreService: IOIMSlotStoreService<string, TColumnSlot>; columnNames?: readonly TColumnName[] | undefined },
): TOIMColumnSlotOwnerOptions<TColumnSlot, TColumnName> {
    return columnSlotOwnerOptions.columnNames !== undefined
        ? { columnNames: columnSlotOwnerOptions.columnNames }
        : { columnSlotStoreService: columnSlotOwnerOptions.columnSlotStoreService };
}

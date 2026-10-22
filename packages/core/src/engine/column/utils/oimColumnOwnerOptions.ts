import type { IOIMSlotStoreService } from '../../store/interfaces/IOIMSlotStoreService';
import type { TOIMKeyedSlot } from '../../slot/types/TOIMKeyedSlot';
import type { TOIMColumnOwnerOptions } from '../types/TOIMColumnOwnerOptions';

export function oimColumnOwnerOptions<TColumnSlot extends TOIMKeyedSlot<string>, TColumnName extends string>(
    columnOwnerOptions:
        | TOIMColumnOwnerOptions<TColumnSlot, TColumnName>
        | { columnSlotStoreService: IOIMSlotStoreService<string, TColumnSlot>; columnNames?: readonly TColumnName[] | undefined },
): TOIMColumnOwnerOptions<TColumnSlot, TColumnName> {
    return columnOwnerOptions.columnNames !== undefined
        ? { columnNames: columnOwnerOptions.columnNames }
        : { columnSlotStoreService: columnOwnerOptions.columnSlotStoreService };
}

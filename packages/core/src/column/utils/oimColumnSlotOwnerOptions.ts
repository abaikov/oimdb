import type { IOIMSlotStoreService } from '../../store/interfaces/IOIMSlotStoreService';
import type { TOIMKeyedSlot } from '../../slot/types/TOIMKeyedSlot';
import type { TOIMColumnGroup } from '../types/TOIMColumnGroup';
import type { TOIMColumnSlotOwnerOptions } from '../types/TOIMColumnSlotOwnerOptions';

export function oimColumnSlotOwnerOptions<TColumnSlot extends TOIMKeyedSlot<string>, TColumnName extends string>(
    columnSlotOwnerOptions: {
        columnSlotStoreService: IOIMSlotStoreService<string, TColumnSlot>;
        columnNames?: readonly TColumnName[] | undefined;
        columnGroups?: readonly TOIMColumnGroup<TColumnName>[] | undefined;
    },
): TOIMColumnSlotOwnerOptions<TColumnSlot, TColumnName> {
    const columnGroups = columnSlotOwnerOptions.columnGroups;
    return columnSlotOwnerOptions.columnNames !== undefined
        ? { columnNames: columnSlotOwnerOptions.columnNames, columnGroups }
        : { columnSlotStoreService: columnSlotOwnerOptions.columnSlotStoreService, columnGroups };
}

import type { IOIMSlotStoreService } from '../../engine/store/interfaces/IOIMSlotStoreService';
import type { TOIMKeyedSlot } from '../../engine/slot/types/TOIMKeyedSlot';
import type { TOIMColumnSlotOwnerOptions } from '../../engine/column/types/TOIMColumnSlotOwnerOptions';
import { oimColumnOwnerOptions } from '../../engine/column/utils/oimColumnOwnerOptions';

export function oimColumnOwnerOptionsWithDefault<TColumnSlot extends TOIMKeyedSlot<string>, TColumnName extends string>(
    columnSlotStoreService: IOIMSlotStoreService<string, TColumnSlot> | undefined,
    columnNames: readonly TColumnName[] | undefined,
    defaultColumnSlotStoreService: IOIMSlotStoreService<string, TColumnSlot>,
): TOIMColumnSlotOwnerOptions<TColumnSlot, TColumnName> {
    return oimColumnOwnerOptions({ columnNames, columnSlotStoreService: columnSlotStoreService ?? defaultColumnSlotStoreService });
}

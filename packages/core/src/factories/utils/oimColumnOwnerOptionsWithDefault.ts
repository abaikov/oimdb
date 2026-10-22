import type { IOIMSlotStoreService } from '../../engine/store/interfaces/IOIMSlotStoreService';
import type { TOIMKeyedSlot } from '../../engine/slot/types/TOIMKeyedSlot';
import type { TOIMColumnOwnerOptions } from '../../engine/column/types/TOIMColumnOwnerOptions';
import { oimColumnOwnerOptions } from '../../engine/column/utils/oimColumnOwnerOptions';

export function oimColumnOwnerOptionsWithDefault<TColumnSlot extends TOIMKeyedSlot<string>, TColumnName extends string>(
    columnSlotStoreService: IOIMSlotStoreService<string, TColumnSlot> | undefined,
    columnNames: readonly TColumnName[] | undefined,
    defaultColumnSlotStoreService: IOIMSlotStoreService<string, TColumnSlot>,
): TOIMColumnOwnerOptions<TColumnSlot, TColumnName> {
    return oimColumnOwnerOptions({ columnNames, columnSlotStoreService: columnSlotStoreService ?? defaultColumnSlotStoreService });
}

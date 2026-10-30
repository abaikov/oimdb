import type { IOIMSlotStoreService } from '../../store/interfaces/IOIMSlotStoreService';
import type { TOIMKeyedSlot } from '../../slot/types/TOIMKeyedSlot';
import type { TOIMColumnSlotOwnerOptions } from '../types/TOIMColumnSlotOwnerOptions';
import { oimColumnSlotOwnerOptions } from './oimColumnSlotOwnerOptions';

export function oimResolveColumnSlotOwnerOptions<TColumnSlot extends TOIMKeyedSlot<string>, TColumnName extends string>(
    columnSlotStoreService: IOIMSlotStoreService<string, TColumnSlot> | undefined,
    columnNames: readonly TColumnName[] | undefined,
    defaultColumnSlotStoreService: IOIMSlotStoreService<string, TColumnSlot>,
): TOIMColumnSlotOwnerOptions<TColumnSlot, TColumnName> {
    return oimColumnSlotOwnerOptions({ columnNames, columnSlotStoreService: columnSlotStoreService ?? defaultColumnSlotStoreService });
}

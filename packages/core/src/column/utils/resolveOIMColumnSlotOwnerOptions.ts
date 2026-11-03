import type { IOIMSlotStoreService } from '../../store/interfaces/IOIMSlotStoreService';
import type { TOIMKeyedSlot } from '../../slot/types/TOIMKeyedSlot';
import type { TOIMColumnGroup } from '../types/TOIMColumnGroup';
import type { TOIMColumnSlotOwnerOptions } from '../types/TOIMColumnSlotOwnerOptions';
import { createOIMColumnSlotOwnerOptions } from './createOIMColumnSlotOwnerOptions';

export function resolveOIMColumnSlotOwnerOptions<TColumnSlot extends TOIMKeyedSlot<string>, TColumnName extends string>(
    columnSlotStoreService: IOIMSlotStoreService<string, TColumnSlot> | undefined,
    columnNames: readonly TColumnName[] | undefined,
    columnGroups: readonly TOIMColumnGroup<TColumnName>[] | undefined,
    defaultColumnSlotStoreService: IOIMSlotStoreService<string, TColumnSlot>,
): TOIMColumnSlotOwnerOptions<TColumnSlot, TColumnName> {
    return createOIMColumnSlotOwnerOptions({
        columnNames, columnGroups, columnSlotStoreService: columnSlotStoreService ?? defaultColumnSlotStoreService,
    });
}

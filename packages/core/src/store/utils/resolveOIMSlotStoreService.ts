import type { IOIMSlotStoreService } from '../interfaces/IOIMSlotStoreService';
import type { TOIMKeyedSlot } from '../../slot/types/TOIMKeyedSlot';
import { OIMSlotMapStoreService } from '../OIMSlotMapStoreService';

export function resolveOIMSlotStoreService<TKey extends NonNullable<unknown>, TSlot extends TOIMKeyedSlot<TKey>, TStore>(
    slotStoreService: IOIMSlotStoreService<TKey, TSlot, TStore> | undefined,
): IOIMSlotStoreService<TKey, TSlot, TStore> {
    return slotStoreService
        ?? OIMSlotMapStoreService.INSTANCE as unknown as IOIMSlotStoreService<TKey, TSlot, TStore>;
}

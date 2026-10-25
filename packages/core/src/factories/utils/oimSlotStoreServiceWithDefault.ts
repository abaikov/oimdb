import type { IOIMSlotStoreService } from '../../engine/store/interfaces/IOIMSlotStoreService';
import type { TOIMKeyedSlot } from '../../engine/slot/types/TOIMKeyedSlot';
import { OIMSlotMapStoreService } from '../../engine/store/OIMSlotMapStoreService';

export function oimSlotStoreServiceWithDefault<TKey extends NonNullable<unknown>, TSlot extends TOIMKeyedSlot<TKey>, TStore>(
    slotStoreService: IOIMSlotStoreService<TKey, TSlot, TStore> | undefined,
): IOIMSlotStoreService<TKey, TSlot, TStore> {
    return slotStoreService
        ?? OIMSlotMapStoreService.INSTANCE as unknown as IOIMSlotStoreService<TKey, TSlot, TStore>;
}

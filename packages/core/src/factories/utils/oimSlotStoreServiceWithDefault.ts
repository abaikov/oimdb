import type { IOIMSlotStoreService } from '../../engine/store/interfaces/IOIMSlotStoreService';
import type { TOIMKeyedSlot } from '../../engine/slot/types/TOIMKeyedSlot';
import { OIMSlotStoreServiceMapDriven } from '../../engine/store/OIMSlotStoreServiceMapDriven';

export function oimSlotStoreServiceWithDefault<TKey, TSlot extends TOIMKeyedSlot<TKey>, TStore>(
    slotStoreService: IOIMSlotStoreService<TKey, TSlot, TStore> | undefined,
): IOIMSlotStoreService<TKey, TSlot, TStore> {
    return slotStoreService
        ?? OIMSlotStoreServiceMapDriven.INSTANCE as IOIMSlotStoreService<unknown, TOIMKeyedSlot<unknown>, unknown> as IOIMSlotStoreService<TKey, TSlot, TStore>;
}

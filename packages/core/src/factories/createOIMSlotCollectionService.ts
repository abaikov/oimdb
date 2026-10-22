import type { IOIMSlotOwner } from '../engine/slot/interfaces/IOIMSlotOwner';
import type { IOIMSlotStoreService } from '../engine/store/interfaces/IOIMSlotStoreService';
import type { TOIMKeyedSlot } from '../engine/slot/types/TOIMKeyedSlot';
import type { TOIMColumnSlot } from '../engine/column/types/TOIMColumnSlot';
import type { OIMColumnOwnerPushDriven } from '../engine/column/OIMColumnOwnerPushDriven';
import type { OIMSlotOwnerService } from '../engine/slot/OIMSlotOwnerService';
import { OIMSlotCollectionService } from '../facade/slot/OIMSlotCollectionService';
import { OIM_DEFAULT_STORE_SLOT_LISTENER } from './defaults/OIM_DEFAULT_STORE_SLOT_LISTENER';

export function createOIMSlotCollectionService<
    TKey, TSlot extends TOIMKeyedSlot<TKey>, TStore, TSlotContentService extends object,
    TColumnName extends string = string, TPatch = unknown,
>(
    options: {
        slotContentService: TSlotContentService & {
            readonly slotOwner: IOIMSlotOwner;
            readonly slotStoreService: IOIMSlotStoreService<TKey, TSlot, TStore>;
        };
    },
): OIMSlotCollectionService<TKey, TSlot, TStore, TSlotContentService, TColumnName, TOIMColumnSlot, OIMColumnOwnerPushDriven, TPatch> {
    const slotContentService = options.slotContentService;
    return new OIMSlotCollectionService({
        slotOwnerService: slotContentService.slotOwner as OIMSlotOwnerService<
            TKey, TSlot, TStore, TColumnName, TOIMColumnSlot, OIMColumnOwnerPushDriven, TPatch
        >,
        slotStoreService: slotContentService.slotStoreService,
        slotContentService,
        storeSlotListener: OIM_DEFAULT_STORE_SLOT_LISTENER.getValue(),
    });
}

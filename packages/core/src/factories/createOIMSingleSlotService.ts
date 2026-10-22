import type { IOIMSlotOwner } from '../engine/slot/interfaces/IOIMSlotOwner';
import type { IOIMSlotStoreService } from '../engine/store/interfaces/IOIMSlotStoreService';
import type { TOIMKeyedSlot } from '../engine/slot/types/TOIMKeyedSlot';
import type { TOIMSingleSlotStore } from '../engine/store/types/TOIMSingleSlotStore';
import type { TOIMColumnSlot } from '../engine/column/types/TOIMColumnSlot';
import type { OIMColumnOwnerPushDriven } from '../engine/column/OIMColumnOwnerPushDriven';
import type { OIMSlotOwnerService } from '../engine/slot/OIMSlotOwnerService';
import type { OIMSlotStoreServiceSingleSlotDriven } from '../engine/store/OIMSlotStoreServiceSingleSlotDriven';
import { OIMSingleSlotService } from '../facade/slot/OIMSingleSlotService';
import { OIM_DEFAULT_STORE_SLOT_LISTENER } from './defaults/OIM_DEFAULT_STORE_SLOT_LISTENER';

export function createOIMSingleSlotService<
    TSlot extends TOIMKeyedSlot<void>, TSlotContentService extends {
        readonly slotOwner: IOIMSlotOwner;
        readonly slotStoreService: IOIMSlotStoreService<void, TSlot, TOIMSingleSlotStore<TSlot>>;
    },
    TColumnName extends string = string, TPatch = unknown,
>(
    options: { slotContentService: TSlotContentService },
): OIMSingleSlotService<TSlot, TSlotContentService, TColumnName, TOIMColumnSlot, OIMColumnOwnerPushDriven, TPatch> {
    const slotContentService = options.slotContentService;
    return new OIMSingleSlotService({
        slotOwnerService: slotContentService.slotOwner as OIMSlotOwnerService<
            void, TSlot, TOIMSingleSlotStore<TSlot>, TColumnName, TOIMColumnSlot, OIMColumnOwnerPushDriven, TPatch
        >,
        slotStoreService: slotContentService.slotStoreService as OIMSlotStoreServiceSingleSlotDriven<TSlot>,
        slotContentService,
        storeSlotListener: OIM_DEFAULT_STORE_SLOT_LISTENER.getValue(),
    });
}

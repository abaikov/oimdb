import type { IOIMStoreSlotListener } from '../../../engine/slot/interfaces/IOIMStoreSlotListener';
import type { OIMSlotOwnerService } from '../../../engine/slot/OIMSlotOwnerService';
import type { OIMSlotStoreServiceSingleSlotDriven } from '../../../engine/store/OIMSlotStoreServiceSingleSlotDriven';
import type { OIMColumnOwner } from '../../../engine/column/OIMColumnOwner';
import type { TOIMSingleSlotStore } from '../../../engine/store/types/TOIMSingleSlotStore';
import type { TOIMKeyedSlot } from '../../../engine/slot/types/TOIMKeyedSlot';
import type { TOIMSlot } from '../../../engine/slot/types/TOIMSlot';

export type TOIMSingleSlotServiceOptions<
    TSlot extends TOIMKeyedSlot<void>, TSlotContentService,
    TColumnName extends string = string, TColumnSlot extends TOIMKeyedSlot<string> = TOIMKeyedSlot<string>,
    TColumnOwner extends OIMColumnOwner<TOIMSlot, TColumnSlot> = OIMColumnOwner<TOIMSlot, TColumnSlot>, TPatch = unknown,
> = {
    slotOwnerService: OIMSlotOwnerService<void, TSlot, TOIMSingleSlotStore<TSlot>, TColumnName, TColumnSlot, TColumnOwner, TPatch>;
    slotStoreService: OIMSlotStoreServiceSingleSlotDriven<TSlot>;
    slotContentService: TSlotContentService;
    storeSlotListener?: IOIMStoreSlotListener | undefined;
};

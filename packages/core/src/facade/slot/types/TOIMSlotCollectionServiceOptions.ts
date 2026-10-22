import type { IOIMSlotStoreService } from '../../../engine/store/interfaces/IOIMSlotStoreService';
import type { IOIMStoreSlotListener } from '../../../engine/slot/interfaces/IOIMStoreSlotListener';
import type { OIMSlotOwnerService } from '../../../engine/slot/OIMSlotOwnerService';
import type { OIMColumnOwner } from '../../../engine/column/OIMColumnOwner';
import type { TOIMKeyedSlot } from '../../../engine/slot/types/TOIMKeyedSlot';
import type { TOIMSlot } from '../../../engine/slot/types/TOIMSlot';

export type TOIMSlotCollectionServiceOptions<
    TKey, TSlot extends TOIMKeyedSlot<TKey>, TStore, TSlotContentService,
    TColumnName extends string = string, TColumnSlot extends TOIMKeyedSlot<string> = TOIMKeyedSlot<string>,
    TColumnOwner extends OIMColumnOwner<TOIMSlot, TColumnSlot> = OIMColumnOwner<TOIMSlot, TColumnSlot>, TPatch = unknown,
> = {
    slotOwnerService: OIMSlotOwnerService<TKey, TSlot, TStore, TColumnName, TColumnSlot, TColumnOwner, TPatch>;
    slotStoreService: IOIMSlotStoreService<TKey, TSlot, TStore>;
    slotContentService: TSlotContentService;
    storeSlotListener?: IOIMStoreSlotListener | undefined;
};

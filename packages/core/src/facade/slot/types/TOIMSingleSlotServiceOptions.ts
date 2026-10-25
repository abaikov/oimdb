import type { IOIMStoreSlotListener } from '../../../engine/slot/interfaces/IOIMStoreSlotListener';
import type { IOIMSingleSlotCreator } from '../../../engine/slot/interfaces/IOIMSingleSlotCreator';
import type { IOIMSlotContentService } from '../../../engine/slot/interfaces/IOIMSlotContentService';
import type { OIMSingleSlotStoreService } from '../../../engine/store/OIMSingleSlotStoreService';
import type { OIMColumnSlotOwner } from '../../../engine/column/OIMColumnSlotOwner';
import type { TOIMSingleSlotStore } from '../../../engine/store/types/TOIMSingleSlotStore';
import type { TOIMKeyedSlot } from '../../../engine/slot/types/TOIMKeyedSlot';
import type { TOIMSlot } from '../../../engine/slot/types/TOIMSlot';
import type { TOIMSlotOwnerServiceOptions } from '../../../engine/slot/types/TOIMSlotOwnerServiceOptions';

export type TOIMSingleSlotServiceOptions<
    TSlot extends TOIMSlot, TSlotContentService,
    TColumnName extends string = string, TColumnSlot extends TOIMKeyedSlot<string> = TOIMKeyedSlot<string>,
    TColumnSlotOwner extends OIMColumnSlotOwner<TOIMSlot, TColumnSlot> = OIMColumnSlotOwner<TOIMSlot, TColumnSlot>, TPatch = unknown,
> = Omit<
    TOIMSlotOwnerServiceOptions<TSlot, TOIMSingleSlotStore<TSlot>, TColumnName, TColumnSlot, TColumnSlotOwner, TPatch>,
    'slotFilingService' | 'slotContentService'
> & {
    slotStoreService: OIMSingleSlotStoreService<TSlot>;
    slotContentService: TSlotContentService & IOIMSlotContentService<TSlot> & IOIMSingleSlotCreator<TSlot>;
    storeSlotListener?: IOIMStoreSlotListener | undefined;
};

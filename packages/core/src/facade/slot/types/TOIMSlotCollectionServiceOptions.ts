import type { IOIMSlotStoreService } from '../../../engine/store/interfaces/IOIMSlotStoreService';
import type { IOIMStoreSlotListener } from '../../../engine/slot/interfaces/IOIMStoreSlotListener';
import type { IOIMKeyedSlotCreator } from '../../../engine/slot/interfaces/IOIMKeyedSlotCreator';
import type { IOIMSlotContentService } from '../../../engine/slot/interfaces/IOIMSlotContentService';
import type { OIMColumnSlotOwner } from '../../../engine/column/OIMColumnSlotOwner';
import type { TOIMKeyedSlot } from '../../../engine/slot/types/TOIMKeyedSlot';
import type { TOIMSlot } from '../../../engine/slot/types/TOIMSlot';
import type { TOIMSlotOwnerServiceOptions } from '../../../engine/slot/types/TOIMSlotOwnerServiceOptions';

export type TOIMSlotCollectionServiceOptions<
    TKey extends NonNullable<unknown>, TSlot extends TOIMKeyedSlot<TKey>, TStore, TSlotContentService,
    TColumnName extends string = string, TColumnSlot extends TOIMKeyedSlot<string> = TOIMKeyedSlot<string>,
    TColumnSlotOwner extends OIMColumnSlotOwner<TOIMSlot, TColumnSlot> = OIMColumnSlotOwner<TOIMSlot, TColumnSlot>, TPatch = unknown,
> = Omit<
    TOIMSlotOwnerServiceOptions<TSlot, TStore, TColumnName, TColumnSlot, TColumnSlotOwner, TPatch>,
    'slotFilingService' | 'slotContentService'
> & {
    slotStoreService: IOIMSlotStoreService<TKey, TSlot, TStore>;
    slotContentService: TSlotContentService & IOIMSlotContentService<TSlot> & IOIMKeyedSlotCreator<TKey, TSlot>;
    storeSlotListener?: IOIMStoreSlotListener | undefined;
};

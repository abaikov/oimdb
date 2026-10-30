import type { IOIMSlotStoreService } from '../../store/interfaces/IOIMSlotStoreService';
import type { IOIMStoreSlotListener } from '../interfaces/IOIMStoreSlotListener';
import type { IOIMKeyedSlotCreator } from '../interfaces/IOIMKeyedSlotCreator';
import type { IOIMSlotContentService } from '../interfaces/IOIMSlotContentService';
import type { OIMColumnSlotOwner } from '../../column/OIMColumnSlotOwner';
import type { TOIMKeyedSlot } from './TOIMKeyedSlot';
import type { TOIMSlot } from './TOIMSlot';
import type { TOIMSlotOwnerServiceOptions } from './TOIMSlotOwnerServiceOptions';

export type TOIMSlotCollectionServiceOptions<
    TKey extends NonNullable<unknown>, TSlot extends TOIMKeyedSlot<TKey>, TStore, TSlotContentService,
    TColumnName extends string = string, TColumnSlot extends TOIMKeyedSlot<string> = TOIMKeyedSlot<string>,
    TColumnSlotOwner extends OIMColumnSlotOwner<TOIMSlot, TColumnSlot> = OIMColumnSlotOwner<TOIMSlot, TColumnSlot>,
> = Omit<
    TOIMSlotOwnerServiceOptions<TSlot, TStore, TColumnName, TColumnSlot, TColumnSlotOwner>,
    'slotFilingService' | 'slotContentService'
> & {
    slotStoreService: IOIMSlotStoreService<TKey, TSlot, TStore>;
    slotContentService: TSlotContentService & IOIMSlotContentService<TSlot> & IOIMKeyedSlotCreator<TKey, TSlot>;
    storeSlotListener?: IOIMStoreSlotListener | undefined;
};

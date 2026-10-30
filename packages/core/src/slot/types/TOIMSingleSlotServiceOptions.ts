import type { IOIMStoreSlotListener } from '../interfaces/IOIMStoreSlotListener';
import type { IOIMSingleSlotCreator } from '../interfaces/IOIMSingleSlotCreator';
import type { IOIMSlotContentService } from '../interfaces/IOIMSlotContentService';
import type { OIMSingleSlotStoreService } from '../../store/OIMSingleSlotStoreService';
import type { OIMColumnSlotOwner } from '../../column/OIMColumnSlotOwner';
import type { TOIMSingleSlotStore } from '../../store/types/TOIMSingleSlotStore';
import type { TOIMKeyedSlot } from './TOIMKeyedSlot';
import type { TOIMSlot } from './TOIMSlot';
import type { TOIMSlotOwnerServiceOptions } from './TOIMSlotOwnerServiceOptions';

export type TOIMSingleSlotServiceOptions<
    TSlot extends TOIMSlot, TSlotContentService,
    TColumnName extends string = string, TColumnSlot extends TOIMKeyedSlot<string> = TOIMKeyedSlot<string>,
    TColumnSlotOwner extends OIMColumnSlotOwner<TOIMSlot, TColumnSlot> = OIMColumnSlotOwner<TOIMSlot, TColumnSlot>,
> = Omit<
    TOIMSlotOwnerServiceOptions<TSlot, TOIMSingleSlotStore<TSlot>, TColumnName, TColumnSlot, TColumnSlotOwner>,
    'slotFilingService' | 'slotContentService'
> & {
    slotStoreService: OIMSingleSlotStoreService<TSlot>;
    slotContentService: TSlotContentService & IOIMSlotContentService<TSlot> & IOIMSingleSlotCreator<TSlot>;
    storeSlotListener?: IOIMStoreSlotListener | undefined;
};

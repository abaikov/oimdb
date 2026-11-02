import type { IOIMSlotStamp } from '../interfaces/IOIMSlotStamp';
import type { IOIMSlotReleasePolicy } from '../../collector/interfaces/IOIMSlotReleasePolicy';
import type { IOIMSlotSubscriptionListener } from '../interfaces/IOIMSlotSubscriptionListener';
import type { IOIMSlotContentService } from '../interfaces/IOIMSlotContentService';
import type { IOIMSlotFilingService } from '../../store/interfaces/IOIMSlotFilingService';
import type { TOIMColumnSlotOwnerOptions } from '../../column/types/TOIMColumnSlotOwnerOptions';
import type { TOIMKeyedSlot } from './TOIMKeyedSlot';
import type { TOIMSlot } from './TOIMSlot';
import type { OIMColumnSlotOwner } from '../../column/OIMColumnSlotOwner';

export type TOIMSlotOwnerServiceOptions<
    TSlot extends TOIMSlot, TStore, TColumnName extends string, TColumnSlot extends TOIMKeyedSlot<string>,
    TColumnSlotOwner extends OIMColumnSlotOwner<TOIMSlot, TColumnSlot>,
> = {
    slotStamp?: IOIMSlotStamp<TSlot> | undefined;
    slotReleasePolicy?: IOIMSlotReleasePolicy | undefined;
    slotSubscriptionListener?: IOIMSlotSubscriptionListener | undefined;
    slotFilingService: IOIMSlotFilingService<TSlot, TStore>;
    slotContentService: IOIMSlotContentService<TSlot>;
    columnSlotOwnerOptions: TOIMColumnSlotOwnerOptions<TColumnSlot, TColumnName>;
    createColumnSlotOwner: (
        columnSlotOwnerOptions: TOIMColumnSlotOwnerOptions<TColumnSlot, TColumnName>, slotSubscriptionListener: IOIMSlotSubscriptionListener | undefined,
    ) => TColumnSlotOwner;
};

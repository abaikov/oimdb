import type { TOIMColumnGroup } from '../column/types/TOIMColumnGroup';
import type { IOIMSlotReleasePolicy } from '../collector/interfaces/IOIMSlotReleasePolicy';
import type { IOIMSlotSubscriptionListener } from './interfaces/IOIMSlotSubscriptionListener';
import type { IOIMSlotContentWriter } from './interfaces/IOIMSlotContentWriter';
import type { IOIMSlotContentService } from './interfaces/IOIMSlotContentService';
import type { IOIMSingleSlotCreator } from './interfaces/IOIMSingleSlotCreator';
import type { IOIMSlotStoreService } from '../store/interfaces/IOIMSlotStoreService';
import type { TOIMColumnSlot } from '../column/types/TOIMColumnSlot';
import type { OIMPushColumnSlotOwner } from '../column/OIMPushColumnSlotOwner';
import type { TOIMSlotContentServiceSingleSlot } from './types/TOIMSlotContentServiceSingleSlot';
import type { TOIMSlotContentServiceContent } from './types/TOIMSlotContentServiceContent';
import { OIMWritableSingleSlotService } from './OIMWritableSingleSlotService';
import { OIMSingleSlotStoreService } from '../store/OIMSingleSlotStoreService';
import { OIM_DEFAULT_STORE_SLOT_LISTENER } from '../db/constants/OIM_DEFAULT_STORE_SLOT_LISTENER';
import { OIMDefaults } from '../db/OIMDefaults';
import { oimResolveSlotOwnerServiceOptions } from './utils/oimResolveSlotOwnerServiceOptions';

export function createOIMSingleSlotService<TSlotContentService extends object, TColumnName extends string = string>(
    options: {
        defaults?: OIMDefaults | undefined;
        slotContentService: TSlotContentService
            & IOIMSingleSlotCreator<TOIMSlotContentServiceSingleSlot<TSlotContentService>>
            & IOIMSlotContentWriter<TOIMSlotContentServiceSingleSlot<TSlotContentService>, TOIMSlotContentServiceContent<TSlotContentService>>
            & IOIMSlotContentService<TOIMSlotContentServiceSingleSlot<TSlotContentService>>;
        slotReleasePolicy?: IOIMSlotReleasePolicy | undefined;
        slotSubscriptionListener?: IOIMSlotSubscriptionListener | undefined;
        columnSlotStoreService?: IOIMSlotStoreService<string, TOIMColumnSlot> | undefined;
        columnNames?: readonly TColumnName[] | undefined;
        columnGroups?: readonly TOIMColumnGroup<TColumnName>[] | undefined;
    },
): OIMWritableSingleSlotService<
    TOIMSlotContentServiceSingleSlot<TSlotContentService>, TOIMSlotContentServiceContent<TSlotContentService>,
    TSlotContentService
        & IOIMSingleSlotCreator<TOIMSlotContentServiceSingleSlot<TSlotContentService>>
        & IOIMSlotContentWriter<TOIMSlotContentServiceSingleSlot<TSlotContentService>, TOIMSlotContentServiceContent<TSlotContentService>>
        & IOIMSlotContentService<TOIMSlotContentServiceSingleSlot<TSlotContentService>>,
    TColumnName, TOIMColumnSlot, OIMPushColumnSlotOwner
> {
    return new OIMWritableSingleSlotService<
        TOIMSlotContentServiceSingleSlot<TSlotContentService>, TOIMSlotContentServiceContent<TSlotContentService>,
        TSlotContentService
            & IOIMSingleSlotCreator<TOIMSlotContentServiceSingleSlot<TSlotContentService>>
            & IOIMSlotContentWriter<TOIMSlotContentServiceSingleSlot<TSlotContentService>, TOIMSlotContentServiceContent<TSlotContentService>>
            & IOIMSlotContentService<TOIMSlotContentServiceSingleSlot<TSlotContentService>>,
        TColumnName, TOIMColumnSlot, OIMPushColumnSlotOwner
    >({
        ...oimResolveSlotOwnerServiceOptions(options.defaults ?? OIMDefaults.INSTANCE, options),
        slotStoreService: OIMSingleSlotStoreService.INSTANCE as OIMSingleSlotStoreService<
            TOIMSlotContentServiceSingleSlot<TSlotContentService>
        >,
        slotContentService: options.slotContentService,
        storeSlotListener: options.defaults?.storeSlotListener ?? OIM_DEFAULT_STORE_SLOT_LISTENER.getValue(),
    });
}

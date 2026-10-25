import type { OIMDB } from './OIMDB';
import type { IOIMSlotReleasePolicy } from '../engine/collector/interfaces/IOIMSlotReleasePolicy';
import type { IOIMSlotSubscriptionListener } from '../engine/slot/interfaces/IOIMSlotSubscriptionListener';
import type { IOIMSlotContentWriter } from '../engine/slot/interfaces/IOIMSlotContentWriter';
import type { IOIMSlotContentService } from '../engine/slot/interfaces/IOIMSlotContentService';
import type { IOIMSingleSlotCreator } from '../engine/slot/interfaces/IOIMSingleSlotCreator';
import type { IOIMSlotStoreService } from '../engine/store/interfaces/IOIMSlotStoreService';
import type { TOIMColumnSlot } from '../engine/column/types/TOIMColumnSlot';
import type { OIMPushColumnSlotOwner } from '../engine/column/OIMPushColumnSlotOwner';
import type { TOIMSlotContentServiceSingleSlot } from './types/TOIMSlotContentServiceSingleSlot';
import type { TOIMSlotContentServiceContent } from './types/TOIMSlotContentServiceContent';
import { OIMWritableSingleSlotService } from '../facade/slot/OIMWritableSingleSlotService';
import { OIMSingleSlotStoreService } from '../engine/store/OIMSingleSlotStoreService';
import { OIM_DEFAULT_STORE_SLOT_LISTENER } from './defaults/OIM_DEFAULT_STORE_SLOT_LISTENER';
import { oimSlotOwnerOptionsWithDefault } from './utils/oimSlotOwnerOptionsWithDefault';

export function createOIMSingleSlotService<TSlotContentService extends object, TColumnName extends string = string>(
    db: OIMDB,
    options: {
        slotContentService: TSlotContentService
            & IOIMSingleSlotCreator<TOIMSlotContentServiceSingleSlot<TSlotContentService>>
            & IOIMSlotContentWriter<TOIMSlotContentServiceSingleSlot<TSlotContentService>, TOIMSlotContentServiceContent<TSlotContentService>>
            & IOIMSlotContentService<TOIMSlotContentServiceSingleSlot<TSlotContentService>>;
        slotReleasePolicy?: IOIMSlotReleasePolicy | undefined;
        slotSubscriptionListener?: IOIMSlotSubscriptionListener | undefined;
        columnSlotStoreService?: IOIMSlotStoreService<string, TOIMColumnSlot> | undefined;
        columnNames?: readonly TColumnName[] | undefined;
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
        ...oimSlotOwnerOptionsWithDefault(db, options),
        slotStoreService: OIMSingleSlotStoreService.INSTANCE as OIMSingleSlotStoreService<
            TOIMSlotContentServiceSingleSlot<TSlotContentService>
        >,
        slotContentService: options.slotContentService,
        storeSlotListener: OIM_DEFAULT_STORE_SLOT_LISTENER.getValue(),
    });
}

import type { OIMDB } from './OIMDB';
import type { IOIMSlotReleasePolicy } from '../engine/collector/interfaces/IOIMSlotReleasePolicy';
import type { IOIMSlotSubscriptionListener } from '../engine/slot/interfaces/IOIMSlotSubscriptionListener';
import type { IOIMSlotContentWriter } from '../engine/slot/interfaces/IOIMSlotContentWriter';
import type { IOIMSlotContentService } from '../engine/slot/interfaces/IOIMSlotContentService';
import type { IOIMKeyedSlotCreator } from '../engine/slot/interfaces/IOIMKeyedSlotCreator';
import type { IOIMSlotStoreService } from '../engine/store/interfaces/IOIMSlotStoreService';
import type { TOIMColumnSlot } from '../engine/column/types/TOIMColumnSlot';
import type { OIMPushColumnSlotOwner } from '../engine/column/OIMPushColumnSlotOwner';
import type { TOIMSlotContentServiceKey } from './types/TOIMSlotContentServiceKey';
import type { TOIMSlotContentServiceSlot } from './types/TOIMSlotContentServiceSlot';
import type { TOIMSlotContentServiceContent } from './types/TOIMSlotContentServiceContent';
import type { TOIMSlotContentServicePatch } from './types/TOIMSlotContentServicePatch';
import { OIMWritableSlotCollectionService } from '../facade/slot/OIMWritableSlotCollectionService';
import { OIM_DEFAULT_STORE_SLOT_LISTENER } from './defaults/OIM_DEFAULT_STORE_SLOT_LISTENER';
import { oimSlotStoreServiceWithDefault } from './utils/oimSlotStoreServiceWithDefault';
import { oimSlotOwnerOptionsWithDefault } from './utils/oimSlotOwnerOptionsWithDefault';

export function createOIMSlotCollectionService<
    TSlotContentService extends object,
    TStore = Map<TOIMSlotContentServiceKey<TSlotContentService>, TOIMSlotContentServiceSlot<TSlotContentService>>,
    TColumnName extends string = string,
>(
    db: OIMDB,
    options: {
        slotContentService: TSlotContentService
            & IOIMKeyedSlotCreator<TOIMSlotContentServiceKey<TSlotContentService>, TOIMSlotContentServiceSlot<TSlotContentService>>
            & IOIMSlotContentWriter<TOIMSlotContentServiceSlot<TSlotContentService>, TOIMSlotContentServiceContent<TSlotContentService>>
            & IOIMSlotContentService<TOIMSlotContentServiceSlot<TSlotContentService>>;
        slotReleasePolicy?: IOIMSlotReleasePolicy | undefined;
        slotSubscriptionListener?: IOIMSlotSubscriptionListener | undefined;
        columnSlotStoreService?: IOIMSlotStoreService<string, TOIMColumnSlot> | undefined;
        columnNames?: readonly TColumnName[] | undefined;
    } & (TOIMSlotContentServiceKey<TSlotContentService> extends readonly unknown[] ? {
        slotStoreService: IOIMSlotStoreService<
            TOIMSlotContentServiceKey<TSlotContentService>, TOIMSlotContentServiceSlot<TSlotContentService>, TStore
        >;
    } : {
        slotStoreService?: IOIMSlotStoreService<
            TOIMSlotContentServiceKey<TSlotContentService>, TOIMSlotContentServiceSlot<TSlotContentService>, TStore
        > | undefined;
    }),
): OIMWritableSlotCollectionService<
    TOIMSlotContentServiceKey<TSlotContentService>, TOIMSlotContentServiceSlot<TSlotContentService>, TStore,
    TOIMSlotContentServiceContent<TSlotContentService>,
    TSlotContentService
        & IOIMKeyedSlotCreator<TOIMSlotContentServiceKey<TSlotContentService>, TOIMSlotContentServiceSlot<TSlotContentService>>
        & IOIMSlotContentWriter<TOIMSlotContentServiceSlot<TSlotContentService>, TOIMSlotContentServiceContent<TSlotContentService>>
        & IOIMSlotContentService<TOIMSlotContentServiceSlot<TSlotContentService>>,
    TColumnName, TOIMColumnSlot, OIMPushColumnSlotOwner, TOIMSlotContentServicePatch<TSlotContentService>
> {
    return new OIMWritableSlotCollectionService<
        TOIMSlotContentServiceKey<TSlotContentService>, TOIMSlotContentServiceSlot<TSlotContentService>, TStore,
        TOIMSlotContentServiceContent<TSlotContentService>,
        TSlotContentService
            & IOIMKeyedSlotCreator<TOIMSlotContentServiceKey<TSlotContentService>, TOIMSlotContentServiceSlot<TSlotContentService>>
            & IOIMSlotContentWriter<TOIMSlotContentServiceSlot<TSlotContentService>, TOIMSlotContentServiceContent<TSlotContentService>>
            & IOIMSlotContentService<TOIMSlotContentServiceSlot<TSlotContentService>>,
        TColumnName, TOIMColumnSlot, OIMPushColumnSlotOwner, TOIMSlotContentServicePatch<TSlotContentService>
    >({
        ...oimSlotOwnerOptionsWithDefault(db, options),
        slotStoreService: oimSlotStoreServiceWithDefault(options.slotStoreService),
        slotContentService: options.slotContentService,
        storeSlotListener: OIM_DEFAULT_STORE_SLOT_LISTENER.getValue(),
    });
}

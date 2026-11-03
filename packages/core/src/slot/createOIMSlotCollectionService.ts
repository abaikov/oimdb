import type { TOIMColumnGroup } from '../column/types/TOIMColumnGroup';
import type { IOIMSlotReleasePolicy } from '../collector/interfaces/IOIMSlotReleasePolicy';
import type { IOIMSlotSubscriptionListener } from './interfaces/IOIMSlotSubscriptionListener';
import type { IOIMSlotContentWriter } from './interfaces/IOIMSlotContentWriter';
import type { IOIMSlotContentService } from './interfaces/IOIMSlotContentService';
import type { IOIMKeyedSlotCreator } from './interfaces/IOIMKeyedSlotCreator';
import type { IOIMSlotStoreService } from '../store/interfaces/IOIMSlotStoreService';
import type { TOIMColumnSlot } from '../column/types/TOIMColumnSlot';
import type { OIMPushColumnSlotOwner } from '../column/OIMPushColumnSlotOwner';
import type { TOIMSlotContentServiceKey } from './types/TOIMSlotContentServiceKey';
import type { TOIMSlotContentServiceSlot } from './types/TOIMSlotContentServiceSlot';
import type { TOIMSlotContentServiceContent } from './types/TOIMSlotContentServiceContent';
import type { TOIMSlotContentServicePatch } from './types/TOIMSlotContentServicePatch';
import { OIMWritableSlotCollectionService } from './OIMWritableSlotCollectionService';
import { OIM_DEFAULT_STORE_SLOT_LISTENER } from '../db/constants/OIM_DEFAULT_STORE_SLOT_LISTENER';
import { resolveOIMSlotStoreService } from '../store/utils/resolveOIMSlotStoreService';
import { OIMDefaults } from '../db/OIMDefaults';
import { resolveOIMSlotOwnerServiceOptions } from './utils/resolveOIMSlotOwnerServiceOptions';

export function createOIMSlotCollectionService<
    TSlotContentService extends object,
    TStore = Map<TOIMSlotContentServiceKey<TSlotContentService>, TOIMSlotContentServiceSlot<TSlotContentService>>,
    TColumnName extends string = string,
>(
    options: {
        defaults?: OIMDefaults | undefined;
        slotContentService: TSlotContentService
            & IOIMKeyedSlotCreator<TOIMSlotContentServiceKey<TSlotContentService>, TOIMSlotContentServiceSlot<TSlotContentService>>
            & IOIMSlotContentWriter<TOIMSlotContentServiceSlot<TSlotContentService>, TOIMSlotContentServiceContent<TSlotContentService>>
            & IOIMSlotContentService<TOIMSlotContentServiceSlot<TSlotContentService>>;
        slotReleasePolicy?: IOIMSlotReleasePolicy | undefined;
        slotSubscriptionListener?: IOIMSlotSubscriptionListener | undefined;
        columnSlotStoreService?: IOIMSlotStoreService<string, TOIMColumnSlot> | undefined;
        columnNames?: readonly TColumnName[] | undefined;
        columnGroups?: readonly TOIMColumnGroup<TColumnName>[] | undefined;
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
        ...resolveOIMSlotOwnerServiceOptions(options.defaults ?? OIMDefaults.INSTANCE, options),
        slotStoreService: resolveOIMSlotStoreService(options.slotStoreService),
        slotContentService: options.slotContentService,
        storeSlotListener: options.defaults?.storeSlotListener ?? OIM_DEFAULT_STORE_SLOT_LISTENER.getValue(),
    });
}

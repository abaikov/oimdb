import type { IOIMSlotContentWriter } from './interfaces/IOIMSlotContentWriter';
import type { IOIMSlotContentService } from './interfaces/IOIMSlotContentService';
import type { IOIMKeyedSlotCreator } from './interfaces/IOIMKeyedSlotCreator';
import type { TOIMColumnSlot } from '../column/types/TOIMColumnSlot';
import type { OIMPushColumnSlotOwner } from '../column/OIMPushColumnSlotOwner';
import type { TOIMSlotContentServiceKey } from './types/TOIMSlotContentServiceKey';
import type { TOIMSlotContentServiceSlot } from './types/TOIMSlotContentServiceSlot';
import type { TOIMSlotContentServiceContent } from './types/TOIMSlotContentServiceContent';
import type { TOIMKeyedSlot } from './types/TOIMKeyedSlot';
import type { TOIMSlotCollectionServiceFactoryOptions } from './types/TOIMSlotCollectionServiceFactoryOptions';
import { OIMWritableSlotCollectionService } from './OIMWritableSlotCollectionService';
import { OIM_DEFAULT_STORE_SLOT_LISTENER } from '../db/constants/OIM_DEFAULT_STORE_SLOT_LISTENER';
import { resolveOIMSlotStoreService } from '../store/utils/resolveOIMSlotStoreService';
import { OIMDefaults } from '../db/OIMDefaults';
import { resolveOIMSlotOwnerServiceOptions } from './utils/resolveOIMSlotOwnerServiceOptions';

export function createOIMSlotCollectionService<
    TSlotContentService extends object,
    TStore = Map<TOIMSlotContentServiceKey<TSlotContentService>, TOIMSlotContentServiceSlot<TSlotContentService>>,
    TColumnName extends string = string,
    TKey extends NonNullable<unknown> = TOIMSlotContentServiceKey<TSlotContentService>,
    TSlot extends TOIMKeyedSlot<TKey> = TOIMSlotContentServiceSlot<TSlotContentService>,
    TContent = TOIMSlotContentServiceContent<TSlotContentService>,
>(
    options: TOIMSlotCollectionServiceFactoryOptions<TSlotContentService, TStore, TColumnName, TKey, TSlot, TContent>,
): OIMWritableSlotCollectionService<
    TKey, TSlot, TStore, TContent,
    TSlotContentService & IOIMKeyedSlotCreator<TKey, TSlot> & IOIMSlotContentWriter<TSlot, TContent> & IOIMSlotContentService<TSlot>,
    TColumnName, TOIMColumnSlot, OIMPushColumnSlotOwner, TContent extends readonly unknown[] ? TContent : Partial<TContent>
> {
    return new OIMWritableSlotCollectionService<
        TKey, TSlot, TStore, TContent,
        TSlotContentService & IOIMKeyedSlotCreator<TKey, TSlot> & IOIMSlotContentWriter<TSlot, TContent> & IOIMSlotContentService<TSlot>,
        TColumnName, TOIMColumnSlot, OIMPushColumnSlotOwner, TContent extends readonly unknown[] ? TContent : Partial<TContent>
    >({
        ...resolveOIMSlotOwnerServiceOptions(options.defaults ?? OIMDefaults.INSTANCE, options),
        slotStoreService: resolveOIMSlotStoreService(options.slotStoreService),
        slotContentService: options.slotContentService,
        storeSlotListener: options.defaults?.storeSlotListener ?? OIM_DEFAULT_STORE_SLOT_LISTENER.getValue(),
    });
}

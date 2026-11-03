import type { OIMDefaults } from '../../db/OIMDefaults';
import type { IOIMSlotStoreService } from '../../store/interfaces/IOIMSlotStoreService';
import type { TOIMBucketSlot } from '../../bucket/types/TOIMBucketSlot';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { OIMBucketContentService } from '../../bucket/OIMBucketContentService';
import type { TOIMSlotCollectionIndexServiceOptions } from '../types/TOIMSlotCollectionIndexServiceOptions';
import type { TOIMSlotCollectionIndexServiceFactoryOptions } from '../types/TOIMSlotCollectionIndexServiceFactoryOptions';
import { OIM_DEFAULT_INDEX_KEYS_SERVICE } from '../../db/constants/OIM_DEFAULT_INDEX_KEYS_SERVICE';
import { OIM_DEFAULT_STORE_SLOT_LISTENER } from '../../db/constants/OIM_DEFAULT_STORE_SLOT_LISTENER';
import { resolveOIMSlotOwnerServiceOptions } from '../../slot/utils/resolveOIMSlotOwnerServiceOptions';
import { createOIMColumnsKeyOf } from './createOIMColumnsKeyOf';

export function resolveOIMSlotCollectionIndexServiceOptions<
    TKey extends NonNullable<unknown>, TEntity extends object, TSlots, TSourceKey extends NonNullable<unknown>, TSourceStore,
    TBucketContentService extends OIMBucketContentService<TOIMEntitySlot<TEntity, TSourceKey>, TSlots, TKey>, TStore,
>(
    defaults: OIMDefaults,
    options: TOIMSlotCollectionIndexServiceFactoryOptions<TEntity, TSourceKey, TSourceStore> & {
        keyOf?: ((entity: TEntity) => TKey) | undefined;
        columns?: readonly string[] | undefined;
    },
    slotStoreService: IOIMSlotStoreService<TKey, TOIMBucketSlot<TSlots, TKey>, TStore>,
    slotContentService: TBucketContentService,
): TOIMSlotCollectionIndexServiceOptions<TKey, TEntity, TOIMBucketSlot<TSlots, TKey>, TStore, TBucketContentService, TSourceKey, TSourceStore> {
    return {
        ...resolveOIMSlotOwnerServiceOptions(defaults, options),
        slotStoreService,
        slotContentService,
        storeSlotListener: defaults.storeSlotListener ?? OIM_DEFAULT_STORE_SLOT_LISTENER.getValue(),
        keyOf: options.keyOf ?? createOIMColumnsKeyOf<TKey, TEntity>(options.columns as readonly string[]),
        columns: options.columns,
        sourceSlotCollectionService: options.entityService,
        indexKeysService: defaults.indexKeysService ?? OIM_DEFAULT_INDEX_KEYS_SERVICE.getValue(),
    };
}

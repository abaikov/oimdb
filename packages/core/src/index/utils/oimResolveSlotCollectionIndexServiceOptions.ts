import type { OIMDB } from '../../db/OIMDB';
import type { IOIMSlotStoreService } from '../../store/interfaces/IOIMSlotStoreService';
import type { TOIMBucketSlot } from '../../bucket/types/TOIMBucketSlot';
import type { TOIMEntitySlot } from '../../entity/types/TOIMEntitySlot';
import type { OIMSlotContentBucketService } from '../../bucket/OIMSlotContentBucketService';
import type { TOIMSlotCollectionIndexServiceOptions } from '../types/TOIMSlotCollectionIndexServiceOptions';
import type { TOIMSlotCollectionIndexServiceFactoryOptions } from '../types/TOIMSlotCollectionIndexServiceFactoryOptions';
import { OIM_DEFAULT_INDEX_KEYS_SERVICE } from '../../db/constants/OIM_DEFAULT_INDEX_KEYS_SERVICE';
import { OIM_DEFAULT_STORE_SLOT_LISTENER } from '../../db/constants/OIM_DEFAULT_STORE_SLOT_LISTENER';
import { oimResolveSlotOwnerServiceOptions } from '../../slot/utils/oimResolveSlotOwnerServiceOptions';
import { oimKeyOfColumns } from './oimKeyOfColumns';

export function oimResolveSlotCollectionIndexServiceOptions<
    TKey extends NonNullable<unknown>, TEntity extends object, TSlots, TSourceKey extends NonNullable<unknown>, TSourceStore,
    TSlotContentService extends OIMSlotContentBucketService<TOIMEntitySlot<TEntity>, TSlots, TKey>, TStore,
>(
    db: OIMDB,
    options: TOIMSlotCollectionIndexServiceFactoryOptions<TEntity, TSourceKey, TSourceStore> & {
        keyOf?: ((entity: TEntity) => TKey) | undefined;
        columns?: readonly string[] | undefined;
    },
    slotStoreService: IOIMSlotStoreService<TKey, TOIMBucketSlot<TSlots, TKey>, TStore>,
    slotContentService: TSlotContentService,
): TOIMSlotCollectionIndexServiceOptions<TKey, TEntity, TOIMBucketSlot<TSlots, TKey>, TStore, TSlotContentService, TSourceKey, TSourceStore> {
    return {
        ...oimResolveSlotOwnerServiceOptions(db, options),
        slotStoreService,
        slotContentService,
        storeSlotListener: OIM_DEFAULT_STORE_SLOT_LISTENER.getValue(),
        keyOf: options.keyOf ?? oimKeyOfColumns<TKey, TEntity>(options.columns as readonly string[]),
        columns: options.columns,
        sourceSlotCollectionService: options.entityService,
        indexKeysService: db.indexKeysService ?? OIM_DEFAULT_INDEX_KEYS_SERVICE.getValue(),
    };
}

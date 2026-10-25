import type { OIMDB } from '../OIMDB';
import type { IOIMSlotStoreService } from '../../engine/store/interfaces/IOIMSlotStoreService';
import type { TOIMBucketSlot } from '../../engine/bucket/types/TOIMBucketSlot';
import type { TOIMEntitySlot } from '../../engine/entity/types/TOIMEntitySlot';
import type { OIMSlotContentBucketService } from '../../facade/bucket/OIMSlotContentBucketService';
import type { TOIMSlotCollectionIndexServiceOptions } from '../../facade/index/types/TOIMSlotCollectionIndexServiceOptions';
import type { TOIMSlotCollectionIndexServiceFactoryOptions } from '../types/TOIMSlotCollectionIndexServiceFactoryOptions';
import { OIM_DEFAULT_INDEX_KEYS_SERVICE } from '../defaults/OIM_DEFAULT_INDEX_KEYS_SERVICE';
import { OIM_DEFAULT_STORE_SLOT_LISTENER } from '../defaults/OIM_DEFAULT_STORE_SLOT_LISTENER';
import { oimSlotOwnerOptionsWithDefault } from './oimSlotOwnerOptionsWithDefault';
import { oimKeyOfColumns } from './oimKeyOfColumns';

export function oimSlotCollectionIndexServiceOptionsWithDefault<
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
        ...oimSlotOwnerOptionsWithDefault(db, options),
        slotStoreService,
        slotContentService,
        storeSlotListener: OIM_DEFAULT_STORE_SLOT_LISTENER.getValue(),
        keyOf: options.keyOf ?? oimKeyOfColumns<TKey, TEntity>(options.columns as readonly string[]),
        columns: options.columns,
        sourceSlotCollectionService: options.entityService,
        indexKeysService: db.indexKeysService ?? OIM_DEFAULT_INDEX_KEYS_SERVICE.getValue(),
    };
}

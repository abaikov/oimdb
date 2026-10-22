import type { OIMDB } from '../OIMDB';
import type { IOIMSlotStoreService } from '../../engine/store/interfaces/IOIMSlotStoreService';
import type { TOIMBucketSlot } from '../../engine/bucket/types/TOIMBucketSlot';
import type { TOIMEntitySlot } from '../../engine/entity/types/TOIMEntitySlot';
import type { OIMSlotContentBucketService } from '../../facade/bucket/OIMSlotContentBucketService';
import type { TOIMIndexServiceOptions } from '../../facade/index/types/TOIMIndexServiceOptions';
import type { TOIMIndexServiceFactoryOptions } from '../types/TOIMIndexServiceFactoryOptions';
import { OIM_DEFAULT_INDEX_KEYS_SERVICE } from '../defaults/OIM_DEFAULT_INDEX_KEYS_SERVICE';
import { OIM_DEFAULT_STORE_SLOT_LISTENER } from '../defaults/OIM_DEFAULT_STORE_SLOT_LISTENER';
import { createOIMBucketSlotOwnerService } from './createOIMBucketSlotOwnerService';
import { oimKeyOfColumns } from './oimKeyOfColumns';

export function oimIndexServiceOptionsWithDefault<
    TKey, TEntity extends object, TSlots, TSourceKey, TSourceStore,
    TSlotContentService extends OIMSlotContentBucketService<TOIMEntitySlot<TEntity>, TSlots>, TStore,
>(
    db: OIMDB,
    options: TOIMIndexServiceFactoryOptions<TEntity, TSourceKey, TSourceStore> & {
        keyOf?: ((entity: TEntity) => TKey) | undefined;
        columns?: readonly string[] | undefined;
    },
    slotStoreService: IOIMSlotStoreService<TKey, TOIMBucketSlot<TSlots, TKey>, TStore>,
    slotContentService: TSlotContentService,
): TOIMIndexServiceOptions<TKey, TEntity, TOIMBucketSlot<TSlots, TKey>, TStore, TSlotContentService, TSourceKey, TSourceStore> {
    return {
        slotOwnerService: createOIMBucketSlotOwnerService(db, {
            slotStoreService,
            slotContentService,
            slotReleasePolicy: options.slotReleasePolicy,
            columnSlotStoreService: options.columnSlotStoreService,
            columnNames: options.columnNames,
        }),
        slotStoreService,
        slotContentService,
        storeSlotListener: OIM_DEFAULT_STORE_SLOT_LISTENER.getValue(),
        keyOf: options.keyOf ?? oimKeyOfColumns<TKey, TEntity>(options.columns as readonly string[]),
        columns: options.columns,
        sourceSlotCollectionService: options.entityService,
        indexKeysService: db.indexKeysService ?? OIM_DEFAULT_INDEX_KEYS_SERVICE.getValue(),
    };
}

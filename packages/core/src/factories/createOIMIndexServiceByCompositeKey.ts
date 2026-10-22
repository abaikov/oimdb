import type { OIMDB } from './OIMDB';
import type { TOIMBucketSlot } from '../engine/bucket/types/TOIMBucketSlot';
import type { TOIMBucketSlotsArrayStore } from '../engine/bucket/array/types/TOIMBucketSlotsArrayStore';
import type { TOIMEntitySlot } from '../engine/entity/types/TOIMEntitySlot';
import type { TOIMEntityColumnName } from '../engine/entity/types/TOIMEntityColumnName';
import type { TOIMStoreKey } from '../engine/store/types/TOIMStoreKey';
import type { TOIMSlotStoreTree } from '../engine/store/types/TOIMSlotStoreTree';
import type { OIMSlotContentBucketService } from '../facade/bucket/OIMSlotContentBucketService';
import type { OIMSlotContentBucketServiceArrayDriven } from '../facade/bucket/OIMSlotContentBucketServiceArrayDriven';
import type { TOIMIndexServiceFactoryOptions } from './types/TOIMIndexServiceFactoryOptions';
import type { OIMIndexService } from '../facade/index/OIMIndexService';
import type { TOIMIndexKey } from '../facade/index/types/TOIMIndexKey';
import { OIMSlotStoreServiceTreeDriven } from '../engine/store/OIMSlotStoreServiceTreeDriven';
import { OIM_DEFAULT_KEY_TREE_WALK_SCALAR } from './defaults/OIM_DEFAULT_KEY_TREE_WALK_SCALAR';
import { createOIMIndexService } from './createOIMIndexService';
import { oimKeyOfColumns } from './utils/oimKeyOfColumns';

export function createOIMIndexServiceByCompositeKey<
    TEntity extends object, TSourceKey,
    const TColumns extends readonly TOIMEntityColumnName<TEntity>[] = readonly TOIMEntityColumnName<TEntity>[],
    TKey extends readonly TOIMStoreKey[] = Extract<TOIMIndexKey<TEntity, TColumns>, readonly TOIMStoreKey[]>,
    TSourceStore = unknown,
    TSlots = TOIMBucketSlotsArrayStore<TOIMEntitySlot<TEntity>>,
    TSlotContentService extends OIMSlotContentBucketService<TOIMEntitySlot<TEntity>, TSlots>
        = OIMSlotContentBucketServiceArrayDriven<TOIMEntitySlot<TEntity>> & OIMSlotContentBucketService<TOIMEntitySlot<TEntity>, TSlots>,
>(
    db: OIMDB,
    options: TOIMIndexServiceFactoryOptions<TEntity, TSourceKey, TSourceStore> & {
        columns: [TKey] extends [never] ? never : TColumns;
        slotContentService?: (TSlotContentService & OIMSlotContentBucketService<TOIMEntitySlot<TEntity>, TSlots>) | undefined;
    },
): OIMIndexService<
    TKey, TEntity, TSlots, TSourceKey, TSourceStore, TSlotContentService, TOIMBucketSlot<TSlots, TKey>,
    TOIMSlotStoreTree<TOIMBucketSlot<TSlots, TKey>, TOIMStoreKey>
> {
    return createOIMIndexService<
        TEntity, TSourceKey, TColumns, TKey, TSourceStore, TSlots, TSlotContentService,
        TOIMSlotStoreTree<TOIMBucketSlot<TSlots, TKey>, TOIMStoreKey>
    >(db, {
        ...options,
        keyOf: oimKeyOfColumns<TKey, TEntity>(options.columns),
        bucketSlotStoreService: new OIMSlotStoreServiceTreeDriven<TOIMStoreKey, TOIMBucketSlot<TSlots, TKey>>(
            OIM_DEFAULT_KEY_TREE_WALK_SCALAR.getValue(),
        ),
    });
}

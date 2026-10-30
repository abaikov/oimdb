import type { OIMDB } from '../db/OIMDB';
import type { IOIMSlotStoreService } from '../store/interfaces/IOIMSlotStoreService';
import type { TOIMSlotCollectionIndexServiceFactoryOptions } from './types/TOIMSlotCollectionIndexServiceFactoryOptions';
import type { TOIMBucketSlot } from '../bucket/types/TOIMBucketSlot';
import type { TOIMBucketSlotsArrayStore } from '../bucket/array/types/TOIMBucketSlotsArrayStore';
import type { TOIMEntitySlot } from '../entity/types/TOIMEntitySlot';
import type { TOIMEntityColumnName } from '../entity/types/TOIMEntityColumnName';
import type { TOIMStoreKey } from '../store/types/TOIMStoreKey';
import type { TOIMIndexKey } from './types/TOIMIndexKey';
import type { TOIMIndexKeyOptions } from './types/TOIMIndexKeyOptions';
import type { TOIMSortColumn } from '../computed/types/TOIMSortColumn';
import { OIMSlotCollectionSortedArrayIndexService } from './OIMSlotCollectionSortedArrayIndexService';
import { OIMSlotContentSortedArrayBucketService } from '../bucket/OIMSlotContentSortedArrayBucketService';
import { oimColumnsComparator } from '../computed/utils/oimColumnsComparator';
import { oimEntitySlotsComparator } from '../computed/utils/oimEntitySlotsComparator';
import { oimResolveSlotStoreService } from '../store/utils/oimResolveSlotStoreService';
import { oimResolveSlotCollectionIndexServiceOptions } from './utils/oimResolveSlotCollectionIndexServiceOptions';

export function createOIMSlotCollectionSortedArrayIndexService<
    TEntity extends object, TSourceKey extends NonNullable<unknown>,
    const TColumns extends readonly TOIMEntityColumnName<TEntity>[] = readonly TOIMEntityColumnName<TEntity>[],
    TKey extends TOIMStoreKey = [TOIMIndexKey<TEntity, TColumns>] extends [TOIMStoreKey]
        ? Extract<TOIMIndexKey<TEntity, TColumns>, TOIMStoreKey> : never,
    TSourceStore = unknown,
    TStore = Map<TKey, TOIMBucketSlot<TOIMBucketSlotsArrayStore<TOIMEntitySlot<TEntity>>, TKey>>,
>(
    db: OIMDB,
    options: TOIMSlotCollectionIndexServiceFactoryOptions<TEntity, TSourceKey, TSourceStore> & {
        sortColumns: readonly TOIMSortColumn<TEntity>[];
        bucketSlotStoreService?: IOIMSlotStoreService<
            TKey, TOIMBucketSlot<TOIMBucketSlotsArrayStore<TOIMEntitySlot<TEntity>>, TKey>, TStore
        > | undefined;
    } & TOIMIndexKeyOptions<TKey, TEntity, TColumns>,
): OIMSlotCollectionSortedArrayIndexService<
    TKey, TEntity, TSourceKey, TSourceStore,
    TOIMBucketSlot<TOIMBucketSlotsArrayStore<TOIMEntitySlot<TEntity>>, TKey>, TStore
> {
    const slotContentService = new OIMSlotContentSortedArrayBucketService<TOIMEntitySlot<TEntity>, TKey>({
        compareBucketMemberSlots: oimEntitySlotsComparator<TEntity>(oimColumnsComparator(options.sortColumns)),
    });
    return new OIMSlotCollectionSortedArrayIndexService({
        ...oimResolveSlotCollectionIndexServiceOptions(
            db, options, oimResolveSlotStoreService(options.bucketSlotStoreService), slotContentService,
        ),
        sortColumns: options.sortColumns,
    });
}

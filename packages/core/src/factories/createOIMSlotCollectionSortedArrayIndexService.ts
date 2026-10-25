import type { OIMDB } from './OIMDB';
import type { IOIMSlotStoreService } from '../engine/store/interfaces/IOIMSlotStoreService';
import type { TOIMSlotCollectionIndexServiceFactoryOptions } from './types/TOIMSlotCollectionIndexServiceFactoryOptions';
import type { TOIMBucketSlot } from '../engine/bucket/types/TOIMBucketSlot';
import type { TOIMBucketSlotsArrayStore } from '../engine/bucket/array/types/TOIMBucketSlotsArrayStore';
import type { TOIMEntitySlot } from '../engine/entity/types/TOIMEntitySlot';
import type { TOIMEntityColumnName } from '../engine/entity/types/TOIMEntityColumnName';
import type { TOIMStoreKey } from '../engine/store/types/TOIMStoreKey';
import type { TOIMIndexKey } from '../facade/index/types/TOIMIndexKey';
import type { TOIMIndexKeyOptions } from '../facade/index/types/TOIMIndexKeyOptions';
import type { TOIMSortColumn } from '../facade/computed/types/TOIMSortColumn';
import { OIMSlotCollectionSortedArrayIndexService } from '../facade/index/OIMSlotCollectionSortedArrayIndexService';
import { OIMSlotContentSortedArrayBucketService } from '../facade/bucket/OIMSlotContentSortedArrayBucketService';
import { oimColumnsComparator } from '../facade/computed/utils/oimColumnsComparator';
import { oimEntitySlotsComparator } from '../facade/computed/utils/oimEntitySlotsComparator';
import { oimSlotStoreServiceWithDefault } from './utils/oimSlotStoreServiceWithDefault';
import { oimSlotCollectionIndexServiceOptionsWithDefault } from './utils/oimSlotCollectionIndexServiceOptionsWithDefault';

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
        ...oimSlotCollectionIndexServiceOptionsWithDefault(
            db, options, oimSlotStoreServiceWithDefault(options.bucketSlotStoreService), slotContentService,
        ),
        sortColumns: options.sortColumns,
    });
}

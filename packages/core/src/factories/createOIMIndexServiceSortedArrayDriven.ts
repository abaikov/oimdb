import type { OIMDB } from './OIMDB';
import type { IOIMSlotStoreService } from '../engine/store/interfaces/IOIMSlotStoreService';
import type { TOIMIndexServiceFactoryOptions } from './types/TOIMIndexServiceFactoryOptions';
import type { TOIMBucketSlot } from '../engine/bucket/types/TOIMBucketSlot';
import type { TOIMBucketSlotsSortedArrayStore } from '../engine/bucket/array/types/TOIMBucketSlotsSortedArrayStore';
import type { TOIMEntitySlot } from '../engine/entity/types/TOIMEntitySlot';
import type { TOIMEntityColumnName } from '../engine/entity/types/TOIMEntityColumnName';
import type { TOIMStoreKey } from '../engine/store/types/TOIMStoreKey';
import type { TOIMIndexKey } from '../facade/index/types/TOIMIndexKey';
import type { TOIMIndexKeyOptions } from '../facade/index/types/TOIMIndexKeyOptions';
import type { TOIMSortColumn } from '../facade/computed/types/TOIMSortColumn';
import { OIMIndexServiceSortedArrayDriven } from '../facade/index/OIMIndexServiceSortedArrayDriven';
import { OIMSlotContentBucketServiceSortedArrayDriven } from '../facade/bucket/OIMSlotContentBucketServiceSortedArrayDriven';
import { oimColumnsComparator } from '../facade/computed/utils/oimColumnsComparator';
import { oimEntitySlotsComparator } from '../facade/computed/utils/oimEntitySlotsComparator';
import { oimSlotStoreServiceWithDefault } from './utils/oimSlotStoreServiceWithDefault';
import { oimIndexServiceOptionsWithDefault } from './utils/oimIndexServiceOptionsWithDefault';

export function createOIMIndexServiceSortedArrayDriven<
    TEntity extends object, TSourceKey,
    const TColumns extends readonly TOIMEntityColumnName<TEntity>[] = readonly TOIMEntityColumnName<TEntity>[],
    TKey extends TOIMStoreKey = [TOIMIndexKey<TEntity, TColumns>] extends [TOIMStoreKey]
        ? Extract<TOIMIndexKey<TEntity, TColumns>, TOIMStoreKey> : never,
    TSourceStore = unknown,
    TStore = Map<TKey, TOIMBucketSlot<TOIMBucketSlotsSortedArrayStore<TOIMEntitySlot<TEntity>>, TKey>>,
>(
    db: OIMDB,
    options: TOIMIndexServiceFactoryOptions<TEntity, TSourceKey, TSourceStore> & {
        sortColumns: readonly TOIMSortColumn<TEntity>[];
        bucketSlotStoreService?: IOIMSlotStoreService<
            TKey, TOIMBucketSlot<TOIMBucketSlotsSortedArrayStore<TOIMEntitySlot<TEntity>>, TKey>, TStore
        > | undefined;
    } & TOIMIndexKeyOptions<TKey, TEntity, TColumns>,
): OIMIndexServiceSortedArrayDriven<
    TKey, TEntity, TSourceKey, TSourceStore,
    TOIMBucketSlot<TOIMBucketSlotsSortedArrayStore<TOIMEntitySlot<TEntity>>, TKey>, TStore
> {
    const slotContentService = new OIMSlotContentBucketServiceSortedArrayDriven<TOIMEntitySlot<TEntity>>({
        compareBucketMemberSlots: oimEntitySlotsComparator<TEntity>(oimColumnsComparator(options.sortColumns)),
    });
    return new OIMIndexServiceSortedArrayDriven({
        ...oimIndexServiceOptionsWithDefault(
            db, options, oimSlotStoreServiceWithDefault(options.bucketSlotStoreService), slotContentService,
        ),
        sortColumns: options.sortColumns,
    });
}

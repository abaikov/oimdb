import type { IOIMBucketCommands } from '../bucket/commands/interfaces/IOIMBucketCommands';
import type { IOIMSlotStoreService } from '../store/interfaces/IOIMSlotStoreService';
import type { TOIMSlotCollectionIndexServiceFactoryOptions } from './types/TOIMSlotCollectionIndexServiceFactoryOptions';
import type { TOIMBucketSlot } from '../bucket/types/TOIMBucketSlot';
import type { TOIMBucketSlotsArrayStore } from '../bucket/array/types/TOIMBucketSlotsArrayStore';
import type { TOIMEntitySlot } from '../entity/types/TOIMEntitySlot';
import type { TOIMColumnName } from '../column/types/TOIMColumnName';
import type { TOIMStoreKey } from '../store/types/TOIMStoreKey';
import type { TOIMIndexKey } from './types/TOIMIndexKey';
import type { TOIMIndexKeyOptions } from './types/TOIMIndexKeyOptions';
import type { TOIMSortColumn } from '../computed/types/TOIMSortColumn';
import { OIMSlotCollectionSortedArrayIndexService } from './OIMSlotCollectionSortedArrayIndexService';
import { OIMSortedArrayBucketContentService } from '../bucket/OIMSortedArrayBucketContentService';
import { createOIMColumnsComparator } from '../computed/utils/createOIMColumnsComparator';
import { createOIMEntitySlotsComparator } from '../computed/utils/createOIMEntitySlotsComparator';
import { resolveOIMSlotStoreService } from '../store/utils/resolveOIMSlotStoreService';
import { OIMDefaults } from '../db/OIMDefaults';
import { resolveOIMSlotCollectionIndexServiceOptions } from './utils/resolveOIMSlotCollectionIndexServiceOptions';

export function createOIMSlotCollectionSortedArrayIndexService<
    TEntity extends object, TSourceKey extends NonNullable<unknown>,
    const TColumns extends readonly TOIMColumnName<TEntity>[] = readonly TOIMColumnName<TEntity>[],
    TKey extends TOIMStoreKey = [TOIMIndexKey<TEntity, TColumns>] extends [TOIMStoreKey]
        ? Extract<TOIMIndexKey<TEntity, TColumns>, TOIMStoreKey> : never,
    TSourceStore = unknown,
    TStore = Map<TKey, TOIMBucketSlot<TOIMBucketSlotsArrayStore<TOIMEntitySlot<TEntity, TSourceKey>>, TKey>>,
>(
    options: TOIMSlotCollectionIndexServiceFactoryOptions<TEntity, TSourceKey, TSourceStore> & {
        sortColumns: readonly TOIMSortColumn<TEntity>[];
        bucketCommands?: IOIMBucketCommands | undefined;
        bucketSlotStoreService?: IOIMSlotStoreService<
            TKey, TOIMBucketSlot<TOIMBucketSlotsArrayStore<TOIMEntitySlot<TEntity, TSourceKey>>, TKey>, TStore
        > | undefined;
    } & TOIMIndexKeyOptions<TKey, TEntity, TColumns>,
): OIMSlotCollectionSortedArrayIndexService<
    TKey, TEntity, TSourceKey, TSourceStore,
    TOIMBucketSlot<TOIMBucketSlotsArrayStore<TOIMEntitySlot<TEntity, TSourceKey>>, TKey>, TStore
> {
    const slotContentService = new OIMSortedArrayBucketContentService<TOIMEntitySlot<TEntity, TSourceKey>, TKey>({
        compareBucketMemberSlots: createOIMEntitySlotsComparator<TEntity>(createOIMColumnsComparator(options.sortColumns)),
        bucketCommands: options.bucketCommands,
    });
    return new OIMSlotCollectionSortedArrayIndexService({
        ...resolveOIMSlotCollectionIndexServiceOptions(
        options.defaults ?? OIMDefaults.INSTANCE, options, resolveOIMSlotStoreService(options.bucketSlotStoreService), slotContentService,
        ),
        sortColumns: options.sortColumns,
    });
}

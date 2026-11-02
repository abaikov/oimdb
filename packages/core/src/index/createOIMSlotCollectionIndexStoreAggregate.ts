import type { TOIMBucketSlot } from '../bucket/types/TOIMBucketSlot';
import type { TOIMBucketSlotsArrayStore } from '../bucket/array/types/TOIMBucketSlotsArrayStore';
import type { TOIMEntitySlot } from '../entity/types/TOIMEntitySlot';
import type { TOIMEntityColumnName } from '../entity/types/TOIMEntityColumnName';
import type { TOIMStoreKey } from '../store/types/TOIMStoreKey';
import type { OIMBucketContentService } from '../bucket/OIMBucketContentService';
import type { OIMPositionalArrayBucketContentService } from '../bucket/OIMPositionalArrayBucketContentService';
import type { OIMSlotCollectionService } from '../slot/OIMSlotCollectionService';
import type { OIMSlotCollectionStoreAggregate } from '../slot/OIMSlotCollectionStoreAggregate';
import type { OIMSlotCollectionIndexService } from './OIMSlotCollectionIndexService';
import type { OIMSlotCollectionIndexStoreAggregate } from './OIMSlotCollectionIndexStoreAggregate';
import type { TOIMIndexKey } from './types/TOIMIndexKey';
import type { TOIMIndexKeyOptions } from './types/TOIMIndexKeyOptions';
import type { TOIMSlotCollectionIndexServiceFactoryOptions } from './types/TOIMSlotCollectionIndexServiceFactoryOptions';
import { createOIMSlotCollectionIndexService } from './createOIMSlotCollectionIndexService';

export function createOIMSlotCollectionIndexStoreAggregate<
    TEntity extends object, TSourceKey extends NonNullable<unknown>, TSourceStore,
    const TColumns extends readonly TOIMEntityColumnName<TEntity>[] = readonly TOIMEntityColumnName<TEntity>[],
    TKey extends TOIMStoreKey = [TOIMIndexKey<TEntity, TColumns>] extends [TOIMStoreKey]
        ? Extract<TOIMIndexKey<TEntity, TColumns>, TOIMStoreKey> : never,
    TSlots = TOIMBucketSlotsArrayStore<TOIMEntitySlot<TEntity, TSourceKey>>,
    TBucketContentService extends OIMBucketContentService<TOIMEntitySlot<TEntity, TSourceKey>, TSlots, TKey>
        = OIMPositionalArrayBucketContentService<TOIMEntitySlot<TEntity, TSourceKey>, TKey>
            & OIMBucketContentService<TOIMEntitySlot<TEntity, TSourceKey>, TSlots, TKey>,
>(
    slotCollectionStoreAggregate: OIMSlotCollectionStoreAggregate<
        TSourceKey, TOIMEntitySlot<TEntity, TSourceKey>, TSourceStore, Partial<TEntity>,
        OIMSlotCollectionService<TSourceKey, TOIMEntitySlot<TEntity, TSourceKey>, TSourceStore, unknown>
    >,
    options: Omit<TOIMSlotCollectionIndexServiceFactoryOptions<TEntity, TSourceKey, TSourceStore>, 'entityService'> & {
        slotContentService?: (TBucketContentService & OIMBucketContentService<TOIMEntitySlot<TEntity, TSourceKey>, TSlots, TKey>) | undefined;
    } & TOIMIndexKeyOptions<TKey, TEntity, TColumns>,
): OIMSlotCollectionIndexStoreAggregate<
    TKey, TEntity, TSlots, TSourceKey, TSourceStore, TOIMBucketSlot<TSlots, TKey>, Map<TKey, TOIMBucketSlot<TSlots, TKey>>,
    OIMSlotCollectionIndexService<
        TKey, TEntity, TSlots, TSourceKey, TSourceStore, TBucketContentService, TOIMBucketSlot<TSlots, TKey>,
        Map<TKey, TOIMBucketSlot<TSlots, TKey>>
    >
> {
    const slotCollectionIndexService = createOIMSlotCollectionIndexService<
        TEntity, TSourceKey, TColumns, TKey, TSourceStore, TSlots, TBucketContentService
    >({ ...options, entityService: slotCollectionStoreAggregate.slotService, bucketSlotStoreService: undefined });
    return slotCollectionIndexService.createStoreAggregate(
        slotCollectionIndexService.createIndexStoreSlot(slotCollectionStoreAggregate.storeSlot),
    );
}

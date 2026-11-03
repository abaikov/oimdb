import type { IOIMSlotStoreService } from '../store/interfaces/IOIMSlotStoreService';
import type { TOIMBucketSlot } from '../bucket/types/TOIMBucketSlot';
import type { TOIMBucketSlotsArrayStore } from '../bucket/array/types/TOIMBucketSlotsArrayStore';
import type { TOIMEntitySlot } from '../entity/types/TOIMEntitySlot';
import type { TOIMColumnName } from '../column/types/TOIMColumnName';
import type { TOIMStoreKey } from '../store/types/TOIMStoreKey';
import type { OIMBucketContentService } from '../bucket/OIMBucketContentService';
import type { TOIMIndexKey } from './types/TOIMIndexKey';
import type { TOIMIndexKeyOptions } from './types/TOIMIndexKeyOptions';
import type { TOIMSlotCollectionIndexServiceFactoryOptions } from './types/TOIMSlotCollectionIndexServiceFactoryOptions';
import { OIMSlotCollectionIndexService } from './OIMSlotCollectionIndexService';
import { OIMPositionalArrayBucketContentService } from '../bucket/OIMPositionalArrayBucketContentService';
import { resolveOIMSlotStoreService } from '../store/utils/resolveOIMSlotStoreService';
import { OIMDefaults } from '../db/OIMDefaults';
import { resolveOIMSlotCollectionIndexServiceOptions } from './utils/resolveOIMSlotCollectionIndexServiceOptions';

export function createOIMSlotCollectionIndexService<
    TEntity extends object, TSourceKey extends NonNullable<unknown>,
    const TColumns extends readonly TOIMColumnName<TEntity>[] = readonly TOIMColumnName<TEntity>[],
    TKey extends TOIMStoreKey = [TOIMIndexKey<TEntity, TColumns>] extends [TOIMStoreKey]
        ? Extract<TOIMIndexKey<TEntity, TColumns>, TOIMStoreKey> : never,
    TSourceStore = unknown,
    TSlots = TOIMBucketSlotsArrayStore<TOIMEntitySlot<TEntity, TSourceKey>>,
    TBucketContentService extends OIMBucketContentService<TOIMEntitySlot<TEntity, TSourceKey>, TSlots, TKey>
        = OIMPositionalArrayBucketContentService<TOIMEntitySlot<TEntity, TSourceKey>, TKey>
            & OIMBucketContentService<TOIMEntitySlot<TEntity, TSourceKey>, TSlots, TKey>,
>(
    options: TOIMSlotCollectionIndexServiceFactoryOptions<TEntity, TSourceKey, TSourceStore> & {
        slotContentService?: (TBucketContentService & OIMBucketContentService<TOIMEntitySlot<TEntity, TSourceKey>, TSlots, TKey>) | undefined;
        bucketSlotStoreService?: undefined;
    } & TOIMIndexKeyOptions<TKey, TEntity, TColumns>,
): OIMSlotCollectionIndexService<
    TKey, TEntity, TSlots, TSourceKey, TSourceStore, TBucketContentService, TOIMBucketSlot<TSlots, TKey>,
    Map<TKey, TOIMBucketSlot<TSlots, TKey>>
>;
export function createOIMSlotCollectionIndexService<
    TEntity extends object, TSourceKey extends NonNullable<unknown>,
    const TColumns extends readonly TOIMColumnName<TEntity>[] = readonly TOIMColumnName<TEntity>[],
    TKey extends TOIMStoreKey | readonly TOIMStoreKey[] = TOIMStoreKey,
    TSourceStore = unknown,
    TSlots = TOIMBucketSlotsArrayStore<TOIMEntitySlot<TEntity, TSourceKey>>,
    TBucketContentService extends OIMBucketContentService<TOIMEntitySlot<TEntity, TSourceKey>, TSlots, TKey>
        = OIMPositionalArrayBucketContentService<TOIMEntitySlot<TEntity, TSourceKey>, TKey>
            & OIMBucketContentService<TOIMEntitySlot<TEntity, TSourceKey>, TSlots, TKey>,
    TStore = Map<TKey, TOIMBucketSlot<TSlots, TKey>>,
>(
    options: TOIMSlotCollectionIndexServiceFactoryOptions<TEntity, TSourceKey, TSourceStore> & {
        slotContentService?: (TBucketContentService & OIMBucketContentService<TOIMEntitySlot<TEntity, TSourceKey>, TSlots, TKey>) | undefined;
        bucketSlotStoreService: IOIMSlotStoreService<TKey, TOIMBucketSlot<TSlots, TKey>, TStore>;
    } & TOIMIndexKeyOptions<TKey, TEntity, TColumns>,
): OIMSlotCollectionIndexService<TKey, TEntity, TSlots, TSourceKey, TSourceStore, TBucketContentService, TOIMBucketSlot<TSlots, TKey>, TStore>;
export function createOIMSlotCollectionIndexService<
    TEntity extends object, TSourceKey extends NonNullable<unknown>, TColumns extends readonly TOIMColumnName<TEntity>[],
    TKey extends TOIMStoreKey | readonly TOIMStoreKey[], TSourceStore, TSlots,
    TBucketContentService extends OIMBucketContentService<TOIMEntitySlot<TEntity, TSourceKey>, TSlots, TKey>, TStore,
>(
    options: TOIMSlotCollectionIndexServiceFactoryOptions<TEntity, TSourceKey, TSourceStore> & {
        slotContentService?: TBucketContentService | undefined;
        bucketSlotStoreService?: IOIMSlotStoreService<TKey, TOIMBucketSlot<TSlots, TKey>, TStore> | undefined;
    } & TOIMIndexKeyOptions<TKey, TEntity, TColumns>,
): OIMSlotCollectionIndexService<TKey, TEntity, TSlots, TSourceKey, TSourceStore, TBucketContentService, TOIMBucketSlot<TSlots, TKey>, TStore> {
    return new OIMSlotCollectionIndexService(resolveOIMSlotCollectionIndexServiceOptions(
        options.defaults ?? OIMDefaults.INSTANCE,
        options,
        resolveOIMSlotStoreService(options.bucketSlotStoreService),
        options.slotContentService
            ?? new OIMPositionalArrayBucketContentService<
                TOIMEntitySlot<TEntity, TSourceKey>, TKey
            >() as unknown as TBucketContentService,
    ));
}

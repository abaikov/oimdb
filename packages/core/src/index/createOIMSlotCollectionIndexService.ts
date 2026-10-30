import type { OIMDB } from '../db/OIMDB';
import type { IOIMSlotStoreService } from '../store/interfaces/IOIMSlotStoreService';
import type { TOIMBucketSlot } from '../bucket/types/TOIMBucketSlot';
import type { TOIMBucketSlotsArrayStore } from '../bucket/array/types/TOIMBucketSlotsArrayStore';
import type { TOIMEntitySlot } from '../entity/types/TOIMEntitySlot';
import type { TOIMEntityColumnName } from '../entity/types/TOIMEntityColumnName';
import type { TOIMStoreKey } from '../store/types/TOIMStoreKey';
import type { OIMSlotContentBucketService } from '../bucket/OIMSlotContentBucketService';
import type { TOIMIndexKey } from './types/TOIMIndexKey';
import type { TOIMIndexKeyOptions } from './types/TOIMIndexKeyOptions';
import type { TOIMSlotCollectionIndexServiceFactoryOptions } from './types/TOIMSlotCollectionIndexServiceFactoryOptions';
import { OIMSlotCollectionIndexService } from './OIMSlotCollectionIndexService';
import { OIMSlotContentPositionalArrayBucketService } from '../bucket/OIMSlotContentPositionalArrayBucketService';
import { oimResolveSlotStoreService } from '../store/utils/oimResolveSlotStoreService';
import { oimResolveSlotCollectionIndexServiceOptions } from './utils/oimResolveSlotCollectionIndexServiceOptions';

export function createOIMSlotCollectionIndexService<
    TEntity extends object, TSourceKey extends NonNullable<unknown>,
    const TColumns extends readonly TOIMEntityColumnName<TEntity>[] = readonly TOIMEntityColumnName<TEntity>[],
    TKey extends TOIMStoreKey = [TOIMIndexKey<TEntity, TColumns>] extends [TOIMStoreKey]
        ? Extract<TOIMIndexKey<TEntity, TColumns>, TOIMStoreKey> : never,
    TSourceStore = unknown,
    TSlots = TOIMBucketSlotsArrayStore<TOIMEntitySlot<TEntity>>,
    TSlotContentService extends OIMSlotContentBucketService<TOIMEntitySlot<TEntity>, TSlots, TKey>
        = OIMSlotContentPositionalArrayBucketService<TOIMEntitySlot<TEntity>, TKey>
            & OIMSlotContentBucketService<TOIMEntitySlot<TEntity>, TSlots, TKey>,
>(
    db: OIMDB,
    options: TOIMSlotCollectionIndexServiceFactoryOptions<TEntity, TSourceKey, TSourceStore> & {
        slotContentService?: (TSlotContentService & OIMSlotContentBucketService<TOIMEntitySlot<TEntity>, TSlots, TKey>) | undefined;
        bucketSlotStoreService?: undefined;
    } & TOIMIndexKeyOptions<TKey, TEntity, TColumns>,
): OIMSlotCollectionIndexService<
    TKey, TEntity, TSlots, TSourceKey, TSourceStore, TSlotContentService, TOIMBucketSlot<TSlots, TKey>,
    Map<TKey, TOIMBucketSlot<TSlots, TKey>>
>;
export function createOIMSlotCollectionIndexService<
    TEntity extends object, TSourceKey extends NonNullable<unknown>,
    const TColumns extends readonly TOIMEntityColumnName<TEntity>[] = readonly TOIMEntityColumnName<TEntity>[],
    TKey extends TOIMStoreKey | readonly TOIMStoreKey[] = TOIMStoreKey,
    TSourceStore = unknown,
    TSlots = TOIMBucketSlotsArrayStore<TOIMEntitySlot<TEntity>>,
    TSlotContentService extends OIMSlotContentBucketService<TOIMEntitySlot<TEntity>, TSlots, TKey>
        = OIMSlotContentPositionalArrayBucketService<TOIMEntitySlot<TEntity>, TKey>
            & OIMSlotContentBucketService<TOIMEntitySlot<TEntity>, TSlots, TKey>,
    TStore = Map<TKey, TOIMBucketSlot<TSlots, TKey>>,
>(
    db: OIMDB,
    options: TOIMSlotCollectionIndexServiceFactoryOptions<TEntity, TSourceKey, TSourceStore> & {
        slotContentService?: (TSlotContentService & OIMSlotContentBucketService<TOIMEntitySlot<TEntity>, TSlots, TKey>) | undefined;
        bucketSlotStoreService: IOIMSlotStoreService<TKey, TOIMBucketSlot<TSlots, TKey>, TStore>;
    } & TOIMIndexKeyOptions<TKey, TEntity, TColumns>,
): OIMSlotCollectionIndexService<TKey, TEntity, TSlots, TSourceKey, TSourceStore, TSlotContentService, TOIMBucketSlot<TSlots, TKey>, TStore>;
export function createOIMSlotCollectionIndexService<
    TEntity extends object, TSourceKey extends NonNullable<unknown>, TColumns extends readonly TOIMEntityColumnName<TEntity>[],
    TKey extends TOIMStoreKey | readonly TOIMStoreKey[], TSourceStore, TSlots,
    TSlotContentService extends OIMSlotContentBucketService<TOIMEntitySlot<TEntity>, TSlots, TKey>, TStore,
>(
    db: OIMDB,
    options: TOIMSlotCollectionIndexServiceFactoryOptions<TEntity, TSourceKey, TSourceStore> & {
        slotContentService?: TSlotContentService | undefined;
        bucketSlotStoreService?: IOIMSlotStoreService<TKey, TOIMBucketSlot<TSlots, TKey>, TStore> | undefined;
    } & TOIMIndexKeyOptions<TKey, TEntity, TColumns>,
): OIMSlotCollectionIndexService<TKey, TEntity, TSlots, TSourceKey, TSourceStore, TSlotContentService, TOIMBucketSlot<TSlots, TKey>, TStore> {
    return new OIMSlotCollectionIndexService(oimResolveSlotCollectionIndexServiceOptions(
        db,
        options,
        oimResolveSlotStoreService(options.bucketSlotStoreService),
        options.slotContentService
            ?? new OIMSlotContentPositionalArrayBucketService<
                TOIMEntitySlot<TEntity>, TKey
            >() as unknown as TSlotContentService,
    ));
}

import type { OIMDB } from './OIMDB';
import type { IOIMSlotStoreService } from '../engine/store/interfaces/IOIMSlotStoreService';
import type { TOIMBucketSlot } from '../engine/bucket/types/TOIMBucketSlot';
import type { TOIMBucketSlotsArrayStore } from '../engine/bucket/array/types/TOIMBucketSlotsArrayStore';
import type { TOIMEntitySlot } from '../engine/entity/types/TOIMEntitySlot';
import type { TOIMEntityColumnName } from '../engine/entity/types/TOIMEntityColumnName';
import type { TOIMStoreKey } from '../engine/store/types/TOIMStoreKey';
import type { OIMSlotContentBucketService } from '../facade/bucket/OIMSlotContentBucketService';
import type { TOIMIndexKey } from '../facade/index/types/TOIMIndexKey';
import type { TOIMIndexKeyOptions } from '../facade/index/types/TOIMIndexKeyOptions';
import type { TOIMSlotCollectionIndexServiceFactoryOptions } from './types/TOIMSlotCollectionIndexServiceFactoryOptions';
import { OIMSlotCollectionIndexService } from '../facade/index/OIMSlotCollectionIndexService';
import { OIMSlotContentPositionalArrayBucketService } from '../facade/bucket/OIMSlotContentPositionalArrayBucketService';
import { oimSlotStoreServiceWithDefault } from './utils/oimSlotStoreServiceWithDefault';
import { oimSlotCollectionIndexServiceOptionsWithDefault } from './utils/oimSlotCollectionIndexServiceOptionsWithDefault';

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
    return new OIMSlotCollectionIndexService(oimSlotCollectionIndexServiceOptionsWithDefault(
        db,
        options,
        oimSlotStoreServiceWithDefault(options.bucketSlotStoreService),
        options.slotContentService
            ?? new OIMSlotContentPositionalArrayBucketService<
                TOIMEntitySlot<TEntity>, TKey
            >() as unknown as TSlotContentService,
    ));
}

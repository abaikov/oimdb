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
import type { TOIMIndexServiceFactoryOptions } from './types/TOIMIndexServiceFactoryOptions';
import { OIMIndexService } from '../facade/index/OIMIndexService';
import { OIMSlotContentBucketServiceArrayDriven } from '../facade/bucket/OIMSlotContentBucketServiceArrayDriven';
import { oimSlotStoreServiceWithDefault } from './utils/oimSlotStoreServiceWithDefault';
import { oimIndexServiceOptionsWithDefault } from './utils/oimIndexServiceOptionsWithDefault';

export function createOIMIndexService<
    TEntity extends object, TSourceKey,
    const TColumns extends readonly TOIMEntityColumnName<TEntity>[] = readonly TOIMEntityColumnName<TEntity>[],
    TKey extends TOIMStoreKey = [TOIMIndexKey<TEntity, TColumns>] extends [TOIMStoreKey]
        ? Extract<TOIMIndexKey<TEntity, TColumns>, TOIMStoreKey> : never,
    TSourceStore = unknown,
    TSlots = TOIMBucketSlotsArrayStore<TOIMEntitySlot<TEntity>>,
    TSlotContentService extends OIMSlotContentBucketService<TOIMEntitySlot<TEntity>, TSlots>
        = OIMSlotContentBucketServiceArrayDriven<TOIMEntitySlot<TEntity>> & OIMSlotContentBucketService<TOIMEntitySlot<TEntity>, TSlots>,
>(
    db: OIMDB,
    options: TOIMIndexServiceFactoryOptions<TEntity, TSourceKey, TSourceStore> & {
        slotContentService?: (TSlotContentService & OIMSlotContentBucketService<TOIMEntitySlot<TEntity>, TSlots>) | undefined;
        bucketSlotStoreService?: undefined;
    } & TOIMIndexKeyOptions<TKey, TEntity, TColumns>,
): OIMIndexService<
    TKey, TEntity, TSlots, TSourceKey, TSourceStore, TSlotContentService, TOIMBucketSlot<TSlots, TKey>,
    Map<TKey, TOIMBucketSlot<TSlots, TKey>>
>;
export function createOIMIndexService<
    TEntity extends object, TSourceKey,
    const TColumns extends readonly TOIMEntityColumnName<TEntity>[] = readonly TOIMEntityColumnName<TEntity>[],
    TKey extends TOIMStoreKey | readonly TOIMStoreKey[] = TOIMStoreKey,
    TSourceStore = unknown,
    TSlots = TOIMBucketSlotsArrayStore<TOIMEntitySlot<TEntity>>,
    TSlotContentService extends OIMSlotContentBucketService<TOIMEntitySlot<TEntity>, TSlots>
        = OIMSlotContentBucketServiceArrayDriven<TOIMEntitySlot<TEntity>> & OIMSlotContentBucketService<TOIMEntitySlot<TEntity>, TSlots>,
    TStore = Map<TKey, TOIMBucketSlot<TSlots, TKey>>,
>(
    db: OIMDB,
    options: TOIMIndexServiceFactoryOptions<TEntity, TSourceKey, TSourceStore> & {
        slotContentService?: (TSlotContentService & OIMSlotContentBucketService<TOIMEntitySlot<TEntity>, TSlots>) | undefined;
        bucketSlotStoreService: IOIMSlotStoreService<TKey, TOIMBucketSlot<TSlots, TKey>, TStore>;
    } & TOIMIndexKeyOptions<TKey, TEntity, TColumns>,
): OIMIndexService<TKey, TEntity, TSlots, TSourceKey, TSourceStore, TSlotContentService, TOIMBucketSlot<TSlots, TKey>, TStore>;
export function createOIMIndexService<
    TEntity extends object, TSourceKey, TColumns extends readonly TOIMEntityColumnName<TEntity>[],
    TKey extends TOIMStoreKey | readonly TOIMStoreKey[], TSourceStore, TSlots,
    TSlotContentService extends OIMSlotContentBucketService<TOIMEntitySlot<TEntity>, TSlots>, TStore,
>(
    db: OIMDB,
    options: TOIMIndexServiceFactoryOptions<TEntity, TSourceKey, TSourceStore> & {
        slotContentService?: TSlotContentService | undefined;
        bucketSlotStoreService?: IOIMSlotStoreService<TKey, TOIMBucketSlot<TSlots, TKey>, TStore> | undefined;
    } & TOIMIndexKeyOptions<TKey, TEntity, TColumns>,
): OIMIndexService<TKey, TEntity, TSlots, TSourceKey, TSourceStore, TSlotContentService, TOIMBucketSlot<TSlots, TKey>, TStore> {
    return new OIMIndexService(oimIndexServiceOptionsWithDefault(
        db,
        options,
        oimSlotStoreServiceWithDefault(options.bucketSlotStoreService),
        options.slotContentService
            ?? new OIMSlotContentBucketServiceArrayDriven<TOIMEntitySlot<TEntity>>() as unknown as TSlotContentService,
    ));
}

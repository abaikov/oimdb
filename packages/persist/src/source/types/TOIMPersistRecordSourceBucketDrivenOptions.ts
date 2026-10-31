import type {
    IOIMChannelMap, OIMBucketContentService, TOIMBucketContentSlot, TOIMDefaultSlotStore, TOIMEntitySlot, TOIMStoreKey,
    TOIMStoreSlot,
} from '@oimdb/core';
import type { TOIMPersistEntityCollectionService } from './TOIMPersistEntityCollectionService';

export type TOIMPersistRecordSourceBucketDrivenOptions<
    TKey extends TOIMStoreKey, TEntity extends object, TSlots,
    TEntityStore = TOIMDefaultSlotStore<TKey, TOIMEntitySlot<TEntity, TKey>>,
> = {
    readonly channelMap: IOIMChannelMap;
    readonly entityCollectionService: TOIMPersistEntityCollectionService<TKey, TEntity, TEntityStore>;
    readonly entityStoreSlot: TOIMStoreSlot<TEntityStore, TOIMEntitySlot<TEntity, TKey>, Partial<TEntity>>;
    readonly bucketContentService: Pick<
        OIMBucketContentService<TOIMEntitySlot<TEntity, TKey>, TSlots>,
        'getBucketMemberSlots' | 'hasBucketMemberSlot' | 'writeSlotContent' | 'addBucketMemberSlots'
    >;
    readonly bucketSlot: TOIMBucketContentSlot<TSlots>;
};

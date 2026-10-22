import type {
    IOIMChannelMap, OIMSlotContentBucketService, TOIMBucketSlot, TOIMDefaultSlotStore, TOIMEntitySlot, TOIMStoreKey,
    TOIMStoreSlot,
} from '@oimdb/core';
import type { TOIMPersistEntityCollectionService } from './TOIMPersistEntityCollectionService';

export type TOIMPersistRecordSourceBucketDrivenOptions<
    TKey extends TOIMStoreKey, TEntity extends object, TSlots, TBucketKey,
    TEntityStore = TOIMDefaultSlotStore<TKey, TOIMEntitySlot<TEntity, TKey>>,
> = {
    readonly channelMap: IOIMChannelMap;
    readonly entityCollectionService: TOIMPersistEntityCollectionService<TKey, TEntity, TEntityStore>;
    readonly entityStoreSlot: TOIMStoreSlot<TEntityStore, TOIMEntitySlot<TEntity, TKey>, Partial<TEntity>>;
    readonly slotContentBucketService: Pick<
        OIMSlotContentBucketService<TOIMEntitySlot<TEntity, TKey>, TSlots>,
        'getBucketMemberSlots' | 'hasBucketMemberSlot' | 'writeBucketMemberSlots' | 'addBucketMemberSlots'
    >;
    readonly bucketSlot: TOIMBucketSlot<TSlots, TBucketKey>;
};

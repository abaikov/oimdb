import type {
    OIMSlotCollectionService, OIMSlotContentBucketService, TOIMBucketSlot, TOIMEntitySlot, TOIMStoreKey, TOIMStoreSlot,
} from '@oimdb/core';
import { useOIMSlotByKey } from './useOIMSlotByKey';

export function useOIMBucketSlotsByKey<TEntity extends object, TSlots = unknown, TKey = TOIMStoreKey, TStore = unknown>(
    bucketCollectionService: Pick<
        OIMSlotCollectionService<
            TKey, TOIMBucketSlot<TSlots, TKey>, TStore,
            Pick<OIMSlotContentBucketService<TOIMEntitySlot<TEntity>, TSlots>, 'getBucketMemberSlots'>
        >,
        'getSlotByKey' | 'holdSlotByKey' | 'slotContentService'
    >,
    bucketStoreSlot: TOIMStoreSlot<TStore, TOIMBucketSlot<TSlots, TKey>>,
    key: TKey,
): readonly TOIMEntitySlot<TEntity>[] {
    const bucketSlot = useOIMSlotByKey('useOIMBucketSlotsByKey', bucketCollectionService, bucketStoreSlot, key);
    return Array.from(bucketCollectionService.slotContentService.getBucketMemberSlots(bucketSlot));
}

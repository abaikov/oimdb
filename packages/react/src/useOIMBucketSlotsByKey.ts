import type {
    OIMSlotCollectionService, OIMBucketContentService, TOIMBucketSlot, TOIMEntitySlot, TOIMStoreKey, TOIMStoreSlot,
} from '@oimdb/core';
import { useOIMSlotByKey } from './useOIMSlotByKey';

export function useOIMBucketSlotsByKey<TEntity extends object, TSlots = unknown, TKey extends NonNullable<unknown> = TOIMStoreKey, TStore = unknown>(
    bucketStoreSlot: TOIMStoreSlot<
        TStore, TOIMBucketSlot<TSlots, TKey>, unknown,
        Pick<
            OIMSlotCollectionService<
                TKey, TOIMBucketSlot<TSlots, TKey>, TStore,
                Pick<OIMBucketContentService<TOIMEntitySlot<TEntity>, TSlots>, 'getBucketMemberSlots'>
            >,
            'getSlotByKey' | 'holdSlotByKey' | 'slotContentService'
        >
    >,
    key: TKey,
): readonly TOIMEntitySlot<TEntity>[] {
    const bucketSlot = useOIMSlotByKey('useOIMBucketSlotsByKey', bucketStoreSlot, key);
    return Array.from(bucketStoreSlot.slotService.slotContentService.getBucketMemberSlots(bucketSlot));
}

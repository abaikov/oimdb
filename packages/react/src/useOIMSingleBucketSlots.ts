import type {
    OIMSingleSlotService, OIMSlotContentBucketService, TOIMBucketContentSlot, TOIMEntitySlot, TOIMSingleSlotStore, TOIMStoreSlot,
} from '@oimdb/core';
import { useOIMSingleSlot } from './useOIMSingleSlot';

export function useOIMSingleBucketSlots<TEntity extends object, TSlots = unknown>(
    singleSlotStoreSlot: TOIMStoreSlot<
        TOIMSingleSlotStore<TOIMBucketContentSlot<TSlots>>, TOIMBucketContentSlot<TSlots>, unknown,
        Pick<
            OIMSingleSlotService<
                TOIMBucketContentSlot<TSlots>,
                Pick<OIMSlotContentBucketService<TOIMEntitySlot<TEntity>, TSlots>, 'getBucketMemberSlots'>
            >,
            'getSingleSlot' | 'holdSingleSlot' | 'slotContentService'
        >
    >,
): readonly TOIMEntitySlot<TEntity>[] {
    const bucketSlot = useOIMSingleSlot('useOIMSingleBucketSlots', singleSlotStoreSlot);
    return Array.from(singleSlotStoreSlot.slotService.slotContentService.getBucketMemberSlots(bucketSlot));
}

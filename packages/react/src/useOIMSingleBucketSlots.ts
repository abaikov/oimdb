import type {
    OIMSingleSlotService, OIMSlotContentBucketService, TOIMBucketContentSlot, TOIMEntitySlot, TOIMSingleSlotStore, TOIMStoreSlot,
} from '@oimdb/core';
import { useOIMSingleSlot } from './useOIMSingleSlot';

export function useOIMSingleBucketSlots<TEntity extends object, TSlots = unknown>(
    singleSlotService: Pick<
        OIMSingleSlotService<
            TOIMBucketContentSlot<TSlots>,
            Pick<OIMSlotContentBucketService<TOIMEntitySlot<TEntity>, TSlots>, 'getBucketMemberSlots'>
        >,
        'getSingleSlot' | 'holdSingleSlot' | 'slotContentService'
    >,
    singleSlotStoreSlot: TOIMStoreSlot<TOIMSingleSlotStore<TOIMBucketContentSlot<TSlots>>, TOIMBucketContentSlot<TSlots>>,
): readonly TOIMEntitySlot<TEntity>[] {
    const bucketSlot = useOIMSingleSlot('useOIMSingleBucketSlots', singleSlotService, singleSlotStoreSlot);
    return Array.from(singleSlotService.slotContentService.getBucketMemberSlots(bucketSlot));
}

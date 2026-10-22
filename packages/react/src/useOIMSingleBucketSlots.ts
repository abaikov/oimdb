import type {
    OIMSingleSlotService, OIMSlotContentBucketService, TOIMBucketSlot, TOIMEntitySlot, TOIMSingleSlotStore, TOIMStoreSlot,
} from '@oimdb/core';
import { useOIMSingleSlot } from './useOIMSingleSlot';

export function useOIMSingleBucketSlots<TEntity extends object, TSlots = unknown>(
    singleSlotService: Pick<
        OIMSingleSlotService<
            TOIMBucketSlot<TSlots, void>,
            Pick<OIMSlotContentBucketService<TOIMEntitySlot<TEntity>, TSlots>, 'getBucketMemberSlots'>
        >,
        'getSingleSlot' | 'holdSingleSlot' | 'slotContentService'
    >,
    singleSlotStoreSlot: TOIMStoreSlot<TOIMSingleSlotStore<TOIMBucketSlot<TSlots, void>>, TOIMBucketSlot<TSlots, void>>,
): readonly TOIMEntitySlot<TEntity>[] {
    const bucketSlot = useOIMSingleSlot('useOIMSingleBucketSlots', singleSlotService, singleSlotStoreSlot);
    return Array.from(singleSlotService.slotContentService.getBucketMemberSlots(bucketSlot));
}

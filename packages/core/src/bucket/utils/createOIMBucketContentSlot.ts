import type { IOIMSlotOwner } from '../../slot/interfaces/IOIMSlotOwner';
import { OIMBucketSlot } from '../OIMBucketSlot';
import type { TOIMBucketContentSlot } from '../types/TOIMBucketContentSlot';
import type { TOIMStoreSlot } from '../../slot/types/TOIMStoreSlot';

export function createOIMBucketContentSlot<TSlots>(
    owner: IOIMSlotOwner,
    bucketSlotsStore: TSlots,
    storeSlot: TOIMStoreSlot<unknown, TOIMBucketContentSlot<TSlots>>,
): TOIMBucketContentSlot<TSlots> {
    return new OIMBucketSlot<TSlots, NonNullable<unknown>>(undefined as unknown as NonNullable<unknown>, owner, bucketSlotsStore, storeSlot);
}

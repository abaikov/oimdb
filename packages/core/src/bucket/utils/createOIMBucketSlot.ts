import type { IOIMSlotOwner } from '../../slot/interfaces/IOIMSlotOwner';
import { OIMBucketSlot } from '../OIMBucketSlot';
import type { TOIMBucketSlot } from '../types/TOIMBucketSlot';
import type { TOIMBucketContentSlot } from '../types/TOIMBucketContentSlot';
import type { TOIMStoreSlot } from '../../slot/types/TOIMStoreSlot';

export function createOIMBucketSlot<TSlots, TKey extends NonNullable<unknown>>(
    key: TKey,
    owner: IOIMSlotOwner,
    bucketSlotsStore: TSlots,
    storeSlot: TOIMStoreSlot<unknown, TOIMBucketContentSlot<TSlots>>,
): TOIMBucketSlot<TSlots, TKey> {
    return new OIMBucketSlot<TSlots, TKey>(key, owner, bucketSlotsStore, storeSlot);
}

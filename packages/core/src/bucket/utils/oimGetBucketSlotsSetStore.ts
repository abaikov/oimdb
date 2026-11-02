import type { OIMBucketSlot } from '../OIMBucketSlot';
import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import type { TOIMBucketContentSlot } from '../types/TOIMBucketContentSlot';
import type { TOIMBucketSlotsSetStore } from '../types/TOIMBucketSlotsSetStore';

export function oimGetBucketSlotsSetStore<TBucketMemberSlot extends TOIMSlot>(
    bucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsSetStore<TBucketMemberSlot>>,
): TOIMBucketSlotsSetStore<TBucketMemberSlot> {
    return (bucketSlot as unknown as OIMBucketSlot<TOIMBucketSlotsSetStore<TBucketMemberSlot>>).bucketSlotsStore;
}

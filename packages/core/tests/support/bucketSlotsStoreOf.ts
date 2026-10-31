import type { OIMBucketSlot } from '../../src/bucket/OIMBucketSlot';
import type { TOIMBucketSlotsArrayStore } from '../../src/bucket/array/types/TOIMBucketSlotsArrayStore';
import type { TOIMSlot } from '../../src/slot/types/TOIMSlot';

export const bucketSlotsStoreOf = <TBucketMemberSlot extends TOIMSlot>(bucketSlot: TOIMSlot): TOIMBucketSlotsArrayStore<TBucketMemberSlot> =>
    (bucketSlot as unknown as OIMBucketSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>, NonNullable<unknown>>).bucketSlotsStore;

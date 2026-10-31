import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import type { TOIMArrayBucketContentServiceOptions } from './TOIMArrayBucketContentServiceOptions';

export type TOIMSortedArrayBucketContentServiceOptions<TBucketMemberSlot extends TOIMSlot = TOIMSlot> =
    TOIMArrayBucketContentServiceOptions<TBucketMemberSlot> & {
        compareBucketMemberSlots: (left: TBucketMemberSlot, right: TBucketMemberSlot) => number;
    };

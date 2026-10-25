import type { TOIMSlot } from '../../../engine/slot/types/TOIMSlot';
import type { TOIMSlotContentArrayBucketServiceOptions } from './TOIMSlotContentArrayBucketServiceOptions';

export type TOIMSlotContentSortedArrayBucketServiceOptions<TBucketMemberSlot extends TOIMSlot = TOIMSlot> =
    TOIMSlotContentArrayBucketServiceOptions<TBucketMemberSlot> & {
        compareBucketMemberSlots: (left: TBucketMemberSlot, right: TBucketMemberSlot) => number;
    };

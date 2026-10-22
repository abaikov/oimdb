import type { TOIMSlot } from '../../../engine/slot/types/TOIMSlot';

export type TOIMSlotContentBucketServiceSortedArrayDrivenOptions<TBucketMemberSlot extends TOIMSlot = TOIMSlot> = {
    compareBucketMemberSlots: (left: TBucketMemberSlot, right: TBucketMemberSlot) => number;
};

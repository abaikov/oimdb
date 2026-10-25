import type { TOIMComputedSlot } from '../../../engine/computed/types/TOIMComputedSlot';
import type { TOIMSlot } from '../../../engine/slot/types/TOIMSlot';

export type TOIMBucketMemoComputedSlot<TBucketMemberSlot extends TOIMSlot, TKey extends NonNullable<unknown>> =
    TOIMComputedSlot<readonly TBucketMemberSlot[], TKey>;

import type { TOIMComputedSlot } from './TOIMComputedSlot';
import type { TOIMSlot } from '../../slot/types/TOIMSlot';

export type TOIMBucketMemoComputedSlot<TBucketMemberSlot extends TOIMSlot, TKey extends NonNullable<unknown>> =
    TOIMComputedSlot<readonly TBucketMemberSlot[], TKey>;

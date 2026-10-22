import type { TOIMSlot } from '../../../slot/types/TOIMSlot';
import type { TOIMBucketSlotsArrayStore } from './TOIMBucketSlotsArrayStore';

export type TOIMBucketSlotsArrayUniqueStore<TBucketMemberSlot extends TOIMSlot = TOIMSlot> =
    TOIMBucketSlotsArrayStore<TBucketMemberSlot> & { uniqueBucketMemberSlots: Set<TBucketMemberSlot> };

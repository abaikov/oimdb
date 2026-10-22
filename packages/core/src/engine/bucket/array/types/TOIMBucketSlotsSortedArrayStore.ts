import type { TOIMSlot } from '../../../slot/types/TOIMSlot';
import type { TOIMBucketSlotsArrayStore } from './TOIMBucketSlotsArrayStore';

export type TOIMBucketSlotsSortedArrayStore<TBucketMemberSlot extends TOIMSlot = TOIMSlot> =
    TOIMBucketSlotsArrayStore<TBucketMemberSlot> & { sortedCount: number };

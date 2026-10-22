import type { TOIMSlot } from '../../../slot/types/TOIMSlot';
import type { TOIMBucketSlotsArrayStore } from '../types/TOIMBucketSlotsArrayStore';

export interface IOIMBucketArrayMembership<
    TBucketMemberSlot extends TOIMSlot = TOIMSlot,
    TSlots extends TOIMBucketSlotsArrayStore<TBucketMemberSlot> = TOIMBucketSlotsArrayStore<TBucketMemberSlot>,
> {
    createStore(): TSlots;
    addSlot(bucketSlotsArrayStore: TSlots, bucketMemberSlot: TBucketMemberSlot): boolean;
    removeSlot(bucketSlotsArrayStore: TSlots, bucketMemberSlot: TBucketMemberSlot): boolean;
    hasSlot(bucketSlotsArrayStore: TSlots, bucketMemberSlot: TBucketMemberSlot): boolean;
    clearSlots(bucketSlotsArrayStore: TSlots): void;
    containsTheSameSequence(bucketSlotsArrayStore: TSlots, bucketMemberSlots: readonly TBucketMemberSlot[]): boolean;
}

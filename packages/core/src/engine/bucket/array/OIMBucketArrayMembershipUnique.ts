import type { IOIMBucketArrayMembership } from './interfaces/IOIMBucketArrayMembership';
import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import type { TOIMBucketSlotsArrayUniqueStore } from './types/TOIMBucketSlotsArrayUniqueStore';
import { oimSameUniqueSlotSequence } from '../utils/oimSameUniqueSlotSequence';

export class OIMBucketArrayMembershipUnique<TBucketMemberSlot extends TOIMSlot = TOIMSlot>
implements IOIMBucketArrayMembership<TBucketMemberSlot, TOIMBucketSlotsArrayUniqueStore<TBucketMemberSlot>> {
    public createStore(): TOIMBucketSlotsArrayUniqueStore<TBucketMemberSlot> {
        return {
            bucketMemberSlots: [],
            uniqueBucketMemberSlots: new Set<TBucketMemberSlot>(),
        };
    }

    public addSlot(
        bucketSlotsArrayUniqueStore: TOIMBucketSlotsArrayUniqueStore<TBucketMemberSlot>, bucketMemberSlot: TBucketMemberSlot,
    ): boolean {
        if (bucketSlotsArrayUniqueStore.uniqueBucketMemberSlots.has(bucketMemberSlot)) return false;
        bucketSlotsArrayUniqueStore.uniqueBucketMemberSlots.add(bucketMemberSlot);
        return true;
    }

    public removeSlot(
        bucketSlotsArrayUniqueStore: TOIMBucketSlotsArrayUniqueStore<TBucketMemberSlot>, bucketMemberSlot: TBucketMemberSlot,
    ): boolean {
        return bucketSlotsArrayUniqueStore.uniqueBucketMemberSlots.delete(bucketMemberSlot);
    }

    public hasSlot(
        bucketSlotsArrayUniqueStore: TOIMBucketSlotsArrayUniqueStore<TBucketMemberSlot>, bucketMemberSlot: TBucketMemberSlot,
    ): boolean {
        return bucketSlotsArrayUniqueStore.uniqueBucketMemberSlots.has(bucketMemberSlot);
    }

    public clearSlots(bucketSlotsArrayUniqueStore: TOIMBucketSlotsArrayUniqueStore<TBucketMemberSlot>): void {
        bucketSlotsArrayUniqueStore.uniqueBucketMemberSlots.clear();
    }

    public containsTheSameSequence(
        bucketSlotsArrayUniqueStore: TOIMBucketSlotsArrayUniqueStore<TBucketMemberSlot>,
        bucketMemberSlots: readonly TBucketMemberSlot[],
    ): boolean {
        const heldBucketMemberSlots = bucketSlotsArrayUniqueStore.bucketMemberSlots;
        if (bucketMemberSlots.length < heldBucketMemberSlots.length) return false;
        return oimSameUniqueSlotSequence(heldBucketMemberSlots, bucketMemberSlots);
    }
}

import type { IOIMBucketArrayMembership } from './interfaces/IOIMBucketArrayMembership';
import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import type { TOIMBucketSlotsArrayStore } from './types/TOIMBucketSlotsArrayStore';
import { oimSameSlotSequence } from '../utils/oimSameSlotSequence';

export class OIMBucketArrayMembershipNonUnique<TBucketMemberSlot extends TOIMSlot = TOIMSlot>
implements IOIMBucketArrayMembership<TBucketMemberSlot, TOIMBucketSlotsArrayStore<TBucketMemberSlot>> {
    public static readonly INSTANCE = new OIMBucketArrayMembershipNonUnique();

    public createStore(): TOIMBucketSlotsArrayStore<TBucketMemberSlot> {
        return { bucketMemberSlots: [] };
    }

    public addSlot(): boolean { return true; }

    public removeSlot(): boolean { return true; }

    public hasSlot(
        bucketSlotsArrayStore: TOIMBucketSlotsArrayStore<TBucketMemberSlot>, bucketMemberSlot: TBucketMemberSlot,
    ): boolean {
        return bucketSlotsArrayStore.bucketMemberSlots.indexOf(bucketMemberSlot) >= 0;
    }

    public clearSlots(): void { return; }

    public containsTheSameSequence(
        bucketSlotsArrayStore: TOIMBucketSlotsArrayStore<TBucketMemberSlot>, bucketMemberSlots: readonly TBucketMemberSlot[],
    ): boolean {
        return oimSameSlotSequence(bucketSlotsArrayStore.bucketMemberSlots, bucketMemberSlots);
    }
}

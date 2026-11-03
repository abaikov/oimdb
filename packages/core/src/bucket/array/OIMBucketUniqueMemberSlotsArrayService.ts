import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import type { OIMChannelQueue } from '../../channel/OIMChannelQueue';
import type { TOIMBucketSlotsArrayStore } from './types/TOIMBucketSlotsArrayStore';
import { OIMBucketMemberSlotsArrayService } from './OIMBucketMemberSlotsArrayService';
import { OIM_NOTHING_WAS_INSERTED } from '../constants/OIM_NOTHING_WAS_INSERTED';
import { OIM_NOTHING_WAS_REMOVED } from '../constants/OIM_NOTHING_WAS_REMOVED';
import { isOIMSameUniqueSlotSequence } from '../utils/isOIMSameUniqueSlotSequence';

export class OIMBucketUniqueMemberSlotsArrayService<TBucketMemberSlot extends TOIMSlot = TOIMSlot>
    extends OIMBucketMemberSlotsArrayService<TBucketMemberSlot> {
    public static override readonly INSTANCE = new OIMBucketUniqueMemberSlotsArrayService();

    public override createBucketSlotsArrayStore(): TOIMBucketSlotsArrayStore<TBucketMemberSlot> {
        return { bucketMemberSlots: [], uniqueBucketMemberSlots: new Set<TBucketMemberSlot>(), sortedCount: 0 };
    }

    public override hasBucketMemberSlot(
        bucketSlotsArrayStore: TOIMBucketSlotsArrayStore<TBucketMemberSlot>, bucketMemberSlot: TBucketMemberSlot,
    ): boolean {
        return peekUniqueBucketMemberSlots(bucketSlotsArrayStore).has(bucketMemberSlot);
    }

    public override appendBucketMemberSlot(
        bucketSlotsArrayStore: TOIMBucketSlotsArrayStore<TBucketMemberSlot>, bucketMemberSlot: TBucketMemberSlot,
    ): boolean {
        const uniqueBucketMemberSlots = peekUniqueBucketMemberSlots(bucketSlotsArrayStore);
        if (uniqueBucketMemberSlots.has(bucketMemberSlot)) return false;
        uniqueBucketMemberSlots.add(bucketMemberSlot);
        return super.appendBucketMemberSlot(bucketSlotsArrayStore, bucketMemberSlot);
    }

    public override insertBucketMemberSlotAt(
        bucketSlotsArrayStore: TOIMBucketSlotsArrayStore<TBucketMemberSlot>, at: number, bucketMemberSlot: TBucketMemberSlot,
    ): number {
        const uniqueBucketMemberSlots = peekUniqueBucketMemberSlots(bucketSlotsArrayStore);
        if (uniqueBucketMemberSlots.has(bucketMemberSlot)) return OIM_NOTHING_WAS_INSERTED;
        uniqueBucketMemberSlots.add(bucketMemberSlot);
        return super.insertBucketMemberSlotAt(bucketSlotsArrayStore, at, bucketMemberSlot);
    }

    public override removeBucketMemberSlot(
        bucketSlotsArrayStore: TOIMBucketSlotsArrayStore<TBucketMemberSlot>, bucketMemberSlot: TBucketMemberSlot,
    ): number {
        if (!peekUniqueBucketMemberSlots(bucketSlotsArrayStore).delete(bucketMemberSlot)) return OIM_NOTHING_WAS_REMOVED;
        return super.removeBucketMemberSlot(bucketSlotsArrayStore, bucketMemberSlot);
    }

    public override removeBucketMemberSlotAt(bucketSlotsArrayStore: TOIMBucketSlotsArrayStore<TBucketMemberSlot>, at: number): TBucketMemberSlot {
        const removedBucketMemberSlot = super.removeBucketMemberSlotAt(bucketSlotsArrayStore, at);
        peekUniqueBucketMemberSlots(bucketSlotsArrayStore).delete(removedBucketMemberSlot);
        return removedBucketMemberSlot;
    }

    public override removeBucketMemberSlotRange(
        bucketSlotsArrayStore: TOIMBucketSlotsArrayStore<TBucketMemberSlot>, at: number, count: number,
    ): TBucketMemberSlot[] {
        const removedBucketMemberSlots = super.removeBucketMemberSlotRange(bucketSlotsArrayStore, at, count);
        const uniqueBucketMemberSlots = peekUniqueBucketMemberSlots(bucketSlotsArrayStore);
        for (let i = 0; i < removedBucketMemberSlots.length; i++) uniqueBucketMemberSlots.delete(removedBucketMemberSlots[i]);
        return removedBucketMemberSlots;
    }

    public override removeBucketMemberSlots(
        bucketSlotsArrayStore: TOIMBucketSlotsArrayStore<TBucketMemberSlot>, bucketMemberSlots: readonly TBucketMemberSlot[],
        removedChannelQueue: OIMChannelQueue<TOIMSlot>, removedAtChannelQueue: OIMChannelQueue<number>,
    ): void {
        const removedCountBefore = removedChannelQueue.getEntryCount();
        super.removeBucketMemberSlots(bucketSlotsArrayStore, bucketMemberSlots, removedChannelQueue, removedAtChannelQueue);
        const uniqueBucketMemberSlots = peekUniqueBucketMemberSlots(bucketSlotsArrayStore);
        for (let i = removedCountBefore; i < removedChannelQueue.getEntryCount(); i++) {
            uniqueBucketMemberSlots.delete(removedChannelQueue.getEntryAt(i) as TBucketMemberSlot);
        }
    }

    public override isSameBucketMemberSlotSequence(
        bucketSlotsArrayStore: TOIMBucketSlotsArrayStore<TBucketMemberSlot>, bucketMemberSlots: readonly TBucketMemberSlot[],
    ): boolean {
        const heldBucketMemberSlots = bucketSlotsArrayStore.bucketMemberSlots;
        if (bucketMemberSlots.length < heldBucketMemberSlots.length) return false;
        return isOIMSameUniqueSlotSequence(heldBucketMemberSlots, bucketMemberSlots);
    }

    public override clearBucketMemberSlots(bucketSlotsArrayStore: TOIMBucketSlotsArrayStore<TBucketMemberSlot>): void {
        super.clearBucketMemberSlots(bucketSlotsArrayStore);
        peekUniqueBucketMemberSlots(bucketSlotsArrayStore).clear();
    }
}

function peekUniqueBucketMemberSlots<TBucketMemberSlot extends TOIMSlot>(
    bucketSlotsArrayStore: TOIMBucketSlotsArrayStore<TBucketMemberSlot>,
): Set<TBucketMemberSlot> {
    return bucketSlotsArrayStore.uniqueBucketMemberSlots as Set<TBucketMemberSlot>;
}

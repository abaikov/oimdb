import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import type { OIMChannelQueue } from '../../channel/OIMChannelQueue';
import type { TOIMBucketSlotsSetStore } from '../types/TOIMBucketSlotsSetStore';
import { OIM_NOTHING_WAS_REMOVED } from '../constants/OIM_NOTHING_WAS_REMOVED';
import { OIM_REMOVED_WITHOUT_A_POSITION } from '../constants/OIM_REMOVED_WITHOUT_A_POSITION';

export class OIMBucketMemberSlotsSetService<TBucketMemberSlot extends TOIMSlot = TOIMSlot> {
    public static readonly INSTANCE = new OIMBucketMemberSlotsSetService();

    public createBucketSlotsSetStore(): TOIMBucketSlotsSetStore<TBucketMemberSlot> {
        return new Set<TBucketMemberSlot>();
    }

    public hasBucketMemberSlot(bucketSlotsSetStore: TOIMBucketSlotsSetStore<TBucketMemberSlot>, bucketMemberSlot: TBucketMemberSlot): boolean {
        return bucketSlotsSetStore.has(bucketMemberSlot);
    }

    public getBucketMemberSlotCount(bucketSlotsSetStore: TOIMBucketSlotsSetStore<TBucketMemberSlot>): number {
        return bucketSlotsSetStore.size;
    }

    public getBucketMemberSlots(bucketSlotsSetStore: TOIMBucketSlotsSetStore<TBucketMemberSlot>): Iterable<TBucketMemberSlot> {
        return bucketSlotsSetStore;
    }

    public addBucketMemberSlot(bucketSlotsSetStore: TOIMBucketSlotsSetStore<TBucketMemberSlot>, bucketMemberSlot: TBucketMemberSlot): boolean {
        const had = bucketSlotsSetStore.size;
        (bucketSlotsSetStore as Set<TBucketMemberSlot>).add(bucketMemberSlot);
        return bucketSlotsSetStore.size > had;
    }

    public removeBucketMemberSlot(bucketSlotsSetStore: TOIMBucketSlotsSetStore<TBucketMemberSlot>, bucketMemberSlot: TBucketMemberSlot): number {
        return (bucketSlotsSetStore as Set<TBucketMemberSlot>).delete(bucketMemberSlot) ? OIM_REMOVED_WITHOUT_A_POSITION : OIM_NOTHING_WAS_REMOVED;
    }

    public removeBucketMemberSlots(
        bucketSlotsSetStore: TOIMBucketSlotsSetStore<TBucketMemberSlot>, bucketMemberSlots: readonly TBucketMemberSlot[],
        removedChannelQueue: OIMChannelQueue<TOIMSlot>, removedAtChannelQueue: OIMChannelQueue<number>,
    ): void {
        for (let i = 0; i < bucketMemberSlots.length; i++) {
            if (!(bucketSlotsSetStore as Set<TBucketMemberSlot>).delete(bucketMemberSlots[i])) continue;
            removedChannelQueue.enqueueEntry(bucketMemberSlots[i]);
            removedAtChannelQueue.enqueueEntry(OIM_REMOVED_WITHOUT_A_POSITION);
        }
    }

    public reconcileBucketMemberSlots(
        bucketSlotsSetStore: TOIMBucketSlotsSetStore<TBucketMemberSlot>, bucketMemberSlots: readonly TBucketMemberSlot[],
        arrivedChannelQueue: OIMChannelQueue<TOIMSlot>, departedChannelQueue: OIMChannelQueue<TOIMSlot>,
    ): void {
        const wantedBucketMemberSlots = new Set<TBucketMemberSlot>(bucketMemberSlots);
        for (const bucketMemberSlot of bucketSlotsSetStore) {
            if (wantedBucketMemberSlots.has(bucketMemberSlot)) continue;
            departedChannelQueue.enqueueEntry(bucketMemberSlot);
            (bucketSlotsSetStore as Set<TBucketMemberSlot>).delete(bucketMemberSlot);
        }
        for (const bucketMemberSlot of wantedBucketMemberSlots) {
            if (bucketSlotsSetStore.has(bucketMemberSlot)) continue;
            (bucketSlotsSetStore as Set<TBucketMemberSlot>).add(bucketMemberSlot);
            arrivedChannelQueue.enqueueEntry(bucketMemberSlot);
        }
    }

    public drainBucketMemberSlots(
        bucketSlotsSetStore: TOIMBucketSlotsSetStore<TBucketMemberSlot>, departedChannelQueue: OIMChannelQueue<TOIMSlot>,
    ): void {
        for (const bucketMemberSlot of bucketSlotsSetStore) departedChannelQueue.enqueueEntry(bucketMemberSlot);
        (bucketSlotsSetStore as Set<TBucketMemberSlot>).clear();
    }

    public clearBucketMemberSlots(bucketSlotsSetStore: TOIMBucketSlotsSetStore<TBucketMemberSlot>): void {
        (bucketSlotsSetStore as Set<TBucketMemberSlot>).clear();
    }
}

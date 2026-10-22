import type { TOIMBucketSlot } from '../../engine/bucket/types/TOIMBucketSlot';
import type { TOIMBucketSlotsSetStore } from '../../engine/bucket/types/TOIMBucketSlotsSetStore';
import type { TOIMSlot } from '../../engine/slot/types/TOIMSlot';
import type { OIMChannelQueue } from '../../engine/channel/OIMChannelQueue';
import type { TOIMSlotContentBucketServiceOptions } from './types/TOIMSlotContentBucketServiceOptions';
import { OIMSlotContentBucketService } from './OIMSlotContentBucketService';
import { OIM_NOTHING_WAS_REMOVED } from '../../engine/bucket/constants/OIM_NOTHING_WAS_REMOVED';
import { OIM_REMOVED_WITHOUT_A_POSITION } from '../../engine/bucket/constants/OIM_REMOVED_WITHOUT_A_POSITION';

export class OIMSlotContentBucketServiceSetDriven<TBucketMemberSlot extends TOIMSlot = TOIMSlot>
    extends OIMSlotContentBucketService<TBucketMemberSlot, TOIMBucketSlotsSetStore<TBucketMemberSlot>> {
    public constructor(options: TOIMSlotContentBucketServiceOptions = {}) {
        super(options);
    }

    protected createBucketMemberSlotsStore(): TOIMBucketSlotsSetStore<TBucketMemberSlot> {
        return new Set<TBucketMemberSlot>();
    }

    protected addSlot(bucketSlot: TOIMBucketSlot<TOIMBucketSlotsSetStore<TBucketMemberSlot>>, bucketMemberSlot: TBucketMemberSlot): boolean {
        const bucketMemberSlotsSetStore = bucketSlot.bucketSlotsStore;
        const had = bucketMemberSlotsSetStore.size;
        bucketMemberSlotsSetStore.add(bucketMemberSlot);
        return bucketMemberSlotsSetStore.size > had;
    }

    protected removeSlot(bucketSlot: TOIMBucketSlot<TOIMBucketSlotsSetStore<TBucketMemberSlot>>, bucketMemberSlot: TBucketMemberSlot): number {
        return bucketSlot.bucketSlotsStore.delete(bucketMemberSlot) ? OIM_REMOVED_WITHOUT_A_POSITION : OIM_NOTHING_WAS_REMOVED;
    }

    protected removeSlots(
        bucketSlot: TOIMBucketSlot<TOIMBucketSlotsSetStore<TBucketMemberSlot>>, bucketMemberSlots: readonly TBucketMemberSlot[],
        removedChannelQueue: OIMChannelQueue<TOIMSlot>, removedAtChannelQueue: OIMChannelQueue<number>,
    ): void {
        const bucketMemberSlotsSetStore = bucketSlot.bucketSlotsStore;
        for (let i = 0; i < bucketMemberSlots.length; i++) {
            if (!bucketMemberSlotsSetStore.delete(bucketMemberSlots[i])) continue;
            removedChannelQueue.enqueueEntry(bucketMemberSlots[i]);
            removedAtChannelQueue.enqueueEntry(OIM_REMOVED_WITHOUT_A_POSITION);
        }
    }

    protected reconcileSlots(
        bucketSlot: TOIMBucketSlot<TOIMBucketSlotsSetStore<TBucketMemberSlot>>, bucketMemberSlots: readonly TBucketMemberSlot[],
        arrivedChannelQueue: OIMChannelQueue<TOIMSlot>, departedChannelQueue: OIMChannelQueue<TOIMSlot>,
    ): void {
        const bucketMemberSlotsSetStore = bucketSlot.bucketSlotsStore;
        const wantedBucketMemberSlots = new Set<TBucketMemberSlot>(bucketMemberSlots);
        for (const bucketMemberSlot of bucketMemberSlotsSetStore) {
            if (wantedBucketMemberSlots.has(bucketMemberSlot)) continue;
            departedChannelQueue.enqueueEntry(bucketMemberSlot);
            bucketMemberSlotsSetStore.delete(bucketMemberSlot);
        }
        for (const bucketMemberSlot of wantedBucketMemberSlots) {
            if (bucketMemberSlotsSetStore.has(bucketMemberSlot)) continue;
            bucketMemberSlotsSetStore.add(bucketMemberSlot);
            arrivedChannelQueue.enqueueEntry(bucketMemberSlot);
        }
    }

    protected drainSlots(
        bucketSlot: TOIMBucketSlot<TOIMBucketSlotsSetStore<TBucketMemberSlot>>, departedChannelQueue: OIMChannelQueue<TOIMSlot>,
    ): void {
        const bucketMemberSlotsSetStore = bucketSlot.bucketSlotsStore;
        for (const bucketMemberSlot of bucketMemberSlotsSetStore) departedChannelQueue.enqueueEntry(bucketMemberSlot);
        bucketMemberSlotsSetStore.clear();
    }

    public hasBucketMemberSlot(bucketSlot: TOIMBucketSlot<TOIMBucketSlotsSetStore<TBucketMemberSlot>>, bucketMemberSlot: TBucketMemberSlot): boolean {
        return bucketSlot.bucketSlotsStore.has(bucketMemberSlot);
    }

    public getBucketMemberSlotCount(bucketSlot: TOIMBucketSlot<TOIMBucketSlotsSetStore<TBucketMemberSlot>>): number {
        return bucketSlot.bucketSlotsStore.size;
    }

    public getBucketMemberSlots(bucketSlot: TOIMBucketSlot<TOIMBucketSlotsSetStore<TBucketMemberSlot>>): Iterable<TBucketMemberSlot> {
        return bucketSlot.bucketSlotsStore;
    }
}

import type { TOIMBucketSlotsSortedArrayStore } from '../../engine/bucket/array/types/TOIMBucketSlotsSortedArrayStore';
import type { TOIMBucketSlotsArrayStore } from '../../engine/bucket/array/types/TOIMBucketSlotsArrayStore';
import type { IOIMBucketArrayMembership } from '../../engine/bucket/array/interfaces/IOIMBucketArrayMembership';
import type { TOIMSlotContentBucketServiceSortedArrayDrivenOptions } from './types/TOIMSlotContentBucketServiceSortedArrayDrivenOptions';
import type { TOIMBucketSlot } from '../../engine/bucket/types/TOIMBucketSlot';
import type { TOIMBucketSlotOwnerService } from '../../engine/bucket/types/TOIMBucketSlotOwnerService';
import type { TOIMSlot } from '../../engine/slot/types/TOIMSlot';
import type { OIMChannelQueue } from '../../engine/channel/OIMChannelQueue';
import { OIMSlotContentBucketServiceArrayBased } from './OIMSlotContentBucketServiceArrayBased';
import { OIMBucketArrayMembershipNonUnique } from '../../engine/bucket/array/OIMBucketArrayMembershipNonUnique';
import { OIM_NOTHING_WAS_REMOVED } from '../../engine/bucket/constants/OIM_NOTHING_WAS_REMOVED';
import { oimGetChannelSlot } from '../../engine/slot/utils/oimGetChannelSlot';
import { OIMContentChangeDeliveryService } from '../../engine/slot/OIMContentChangeDeliveryService';

const insertionTailLimit = 8;

export class OIMSlotContentBucketServiceSortedArrayDriven<TBucketMemberSlot extends TOIMSlot = TOIMSlot>
    extends OIMSlotContentBucketServiceArrayBased<TBucketMemberSlot, TOIMBucketSlotsSortedArrayStore<TBucketMemberSlot>> {
    private readonly compareBucketMemberSlots: (left: TBucketMemberSlot, right: TBucketMemberSlot) => number;

    public constructor(options: TOIMSlotContentBucketServiceSortedArrayDrivenOptions<TBucketMemberSlot>) {
        super({}, OIMBucketArrayMembershipNonUnique.INSTANCE as IOIMBucketArrayMembership<TOIMSlot, TOIMBucketSlotsArrayStore> as IOIMBucketArrayMembership<TBucketMemberSlot, TOIMBucketSlotsSortedArrayStore<TBucketMemberSlot>>);
        this.compareBucketMemberSlots = options.compareBucketMemberSlots;
    }

    protected createBucketMemberSlotsStore(): TOIMBucketSlotsSortedArrayStore<TBucketMemberSlot> {
        return { bucketMemberSlots: [], sortedCount: 0 };
    }

    protected override removeSlot(
        bucketSlot: TOIMBucketSlot<TOIMBucketSlotsSortedArrayStore<TBucketMemberSlot>>, bucketMemberSlot: TBucketMemberSlot,
    ): number {
        const at = super.removeSlot(bucketSlot, bucketMemberSlot);
        if (at === OIM_NOTHING_WAS_REMOVED) return OIM_NOTHING_WAS_REMOVED;
        const bucketMemberSlotsSortedArrayStore = bucketSlot.bucketSlotsStore;
        if (at < bucketMemberSlotsSortedArrayStore.sortedCount) bucketMemberSlotsSortedArrayStore.sortedCount--;
        return at;
    }

    protected override removeSlots(
        bucketSlot: TOIMBucketSlot<TOIMBucketSlotsSortedArrayStore<TBucketMemberSlot>>, bucketMemberSlots: readonly TBucketMemberSlot[],
        removedChannelQueue: OIMChannelQueue<TOIMSlot>, removedAtChannelQueue: OIMChannelQueue<number>,
    ): void {
        const bucketMemberSlotsSortedArrayStore = bucketSlot.bucketSlotsStore;
        const sortedCount = bucketMemberSlotsSortedArrayStore.sortedCount;
        const removedCountBefore = removedChannelQueue.getEntryCount();
        const removedAtCountBefore = removedAtChannelQueue.getEntryCount();
        super.removeSlots(bucketSlot, bucketMemberSlots, removedChannelQueue, removedAtChannelQueue);
        const removedCount = removedChannelQueue.getEntryCount() - removedCountBefore;
        let removedFromSortedCount = 0;
        for (let i = 0; i < removedCount; i++) {
            if (removedAtChannelQueue.getEntryAt(removedAtCountBefore + i) + i >= sortedCount) break;
            removedFromSortedCount++;
        }
        bucketMemberSlotsSortedArrayStore.sortedCount = sortedCount - removedFromSortedCount;
    }

    protected override reconcileSlots(
        bucketSlot: TOIMBucketSlot<TOIMBucketSlotsSortedArrayStore<TBucketMemberSlot>>, bucketMemberSlots: readonly TBucketMemberSlot[],
        arrivedChannelQueue: OIMChannelQueue<TOIMSlot>, departedChannelQueue: OIMChannelQueue<TOIMSlot>,
    ): void {
        super.reconcileSlots(bucketSlot, bucketMemberSlots, arrivedChannelQueue, departedChannelQueue);
        bucketSlot.bucketSlotsStore.sortedCount = 0;
    }

    protected override drainSlots(
        bucketSlot: TOIMBucketSlot<TOIMBucketSlotsSortedArrayStore<TBucketMemberSlot>>, departedChannelQueue: OIMChannelQueue<TOIMSlot>,
    ): void {
        const bucketMemberSlotsSortedArrayStore = bucketSlot.bucketSlotsStore;
        this.settle(bucketMemberSlotsSortedArrayStore);
        super.drainSlots(bucketSlot, departedChannelQueue);
        bucketMemberSlotsSortedArrayStore.sortedCount = 0;
    }

    public override getBucketMemberSlots(
        bucketSlot: TOIMBucketSlot<TOIMBucketSlotsSortedArrayStore<TBucketMemberSlot>>,
    ): Iterable<TBucketMemberSlot> {
        this.settle(bucketSlot.bucketSlotsStore);
        return super.getBucketMemberSlots(bucketSlot);
    }

    public override getBucketMemberSlotAt(
        bucketSlot: TOIMBucketSlot<TOIMBucketSlotsSortedArrayStore<TBucketMemberSlot>>, at: number,
    ): TBucketMemberSlot | undefined {
        this.settle(bucketSlot.bucketSlotsStore);
        return super.getBucketMemberSlotAt(bucketSlot, at);
    }

    public override getBucketMemberSlotPosition(
        bucketSlot: TOIMBucketSlot<TOIMBucketSlotsSortedArrayStore<TBucketMemberSlot>>, bucketMemberSlot: TBucketMemberSlot,
    ): number {
        this.settle(bucketSlot.bucketSlotsStore);
        return super.getBucketMemberSlotPosition(bucketSlot, bucketMemberSlot);
    }

    public repositionBucketMemberSlot(
        bucketSlot: TOIMBucketSlot<TOIMBucketSlotsSortedArrayStore<TBucketMemberSlot>>,
        bucketMemberSlot: TBucketMemberSlot,
    ): void {
        const slotOwnerService = bucketSlot.owner as TOIMBucketSlotOwnerService<TOIMBucketSlotsSortedArrayStore<TBucketMemberSlot>>;
        slotOwnerService.assertWritable(bucketSlot);
        const channelSlot = oimGetChannelSlot(bucketSlot);
        OIMContentChangeDeliveryService.INSTANCE.openContentSubframe(channelSlot);
        try {
            if (this.removeSlot(bucketSlot, bucketMemberSlot) === OIM_NOTHING_WAS_REMOVED) return;
            if (this.addSlot(bucketSlot, bucketMemberSlot)) this.markBucketSlotChanged(bucketSlot);
        } finally {
            OIMContentChangeDeliveryService.INSTANCE.closeContentSubframe(channelSlot);
        }
    }

    private settle(bucketMemberSlotsSortedArrayStore: TOIMBucketSlotsSortedArrayStore<TBucketMemberSlot>): void {
        const bucketMemberSlots = bucketMemberSlotsSortedArrayStore.bucketMemberSlots;
        const length = bucketMemberSlots.length;
        const sortedCount = bucketMemberSlotsSortedArrayStore.sortedCount;
        if (length === sortedCount) return;
        const compareBucketMemberSlots = this.compareBucketMemberSlots;
        if (length - sortedCount > insertionTailLimit) {
            bucketMemberSlots.sort(compareBucketMemberSlots);
            bucketMemberSlotsSortedArrayStore.sortedCount = length;
            return;
        }
        for (let at = sortedCount; at < length; at++) {
            const bucketMemberSlot = bucketMemberSlots[at];
            let low = 0;
            let high = at;
            while (low < high) {
                const middle = (low + high) >>> 1;
                if (compareBucketMemberSlots(bucketMemberSlots[middle], bucketMemberSlot) <= 0) low = middle + 1;
                else high = middle;
            }
            if (low === at) continue;
            bucketMemberSlots.splice(at, 1);
            bucketMemberSlots.splice(low, 0, bucketMemberSlot);
        }
        bucketMemberSlotsSortedArrayStore.sortedCount = length;
    }
}

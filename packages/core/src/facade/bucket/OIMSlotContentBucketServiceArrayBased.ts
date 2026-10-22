import type { IOIMBucketArrayMembership } from '../../engine/bucket/array/interfaces/IOIMBucketArrayMembership';
import type { TOIMBucketSlotsArrayStore } from '../../engine/bucket/array/types/TOIMBucketSlotsArrayStore';
import type { TOIMBucketSlot } from '../../engine/bucket/types/TOIMBucketSlot';
import type { TOIMSlot } from '../../engine/slot/types/TOIMSlot';
import type { OIMChannelQueue } from '../../engine/channel/OIMChannelQueue';
import type { TOIMSlotContentBucketServiceOptions } from './types/TOIMSlotContentBucketServiceOptions';
import { OIMSlotContentBucketService } from './OIMSlotContentBucketService';
import { OIM_NOTHING_WAS_REMOVED } from '../../engine/bucket/constants/OIM_NOTHING_WAS_REMOVED';

export abstract class OIMSlotContentBucketServiceArrayBased<
    TBucketMemberSlot extends TOIMSlot, TSlots extends TOIMBucketSlotsArrayStore<TBucketMemberSlot>,
> extends OIMSlotContentBucketService<TBucketMemberSlot, TSlots> {
    protected readonly bucketArrayMembership: Omit<IOIMBucketArrayMembership<TBucketMemberSlot, TSlots>, 'createStore'>;

    protected constructor(
        options: TOIMSlotContentBucketServiceOptions,
        bucketArrayMembership: Omit<IOIMBucketArrayMembership<TBucketMemberSlot, TSlots>, 'createStore'>,
    ) {
        super(options);
        this.bucketArrayMembership = bucketArrayMembership;
    }

    protected addSlot(bucketSlot: TOIMBucketSlot<TSlots>, bucketMemberSlot: TBucketMemberSlot): boolean {
        const bucketMemberSlotsArrayStore = bucketSlot.bucketSlotsStore;
        if (!this.bucketArrayMembership.addSlot(bucketMemberSlotsArrayStore, bucketMemberSlot)) return false;
        bucketMemberSlotsArrayStore.bucketMemberSlots.push(bucketMemberSlot);
        return true;
    }

    protected removeSlot(bucketSlot: TOIMBucketSlot<TSlots>, bucketMemberSlot: TBucketMemberSlot): number {
        const bucketMemberSlotsArrayStore = bucketSlot.bucketSlotsStore;
        if (!this.bucketArrayMembership.removeSlot(bucketMemberSlotsArrayStore, bucketMemberSlot)) return OIM_NOTHING_WAS_REMOVED;
        const bucketMemberSlots = bucketMemberSlotsArrayStore.bucketMemberSlots;
        const at = bucketMemberSlots.indexOf(bucketMemberSlot);
        if (at >= 0) bucketMemberSlots.splice(at, 1);
        return at;
    }

    protected removeSlots(
        bucketSlot: TOIMBucketSlot<TSlots>, bucketMemberSlots: readonly TBucketMemberSlot[],
        removedChannelQueue: OIMChannelQueue<TOIMSlot>, removedAtChannelQueue: OIMChannelQueue<number>,
    ): void {
        if (bucketMemberSlots.length === 0) return;
        const bucketMemberSlotsArrayStore = bucketSlot.bucketSlotsStore;
        const leavingCounts = new Map<TBucketMemberSlot, number>();
        for (let i = 0; i < bucketMemberSlots.length; i++) {
            leavingCounts.set(bucketMemberSlots[i], (leavingCounts.get(bucketMemberSlots[i]) ?? 0) + 1);
        }
        const heldBucketMemberSlots = bucketMemberSlotsArrayStore.bucketMemberSlots;
        const length = heldBucketMemberSlots.length;
        let kept = 0;
        for (let read = 0; read < length; read++) {
            const bucketMemberSlot = heldBucketMemberSlots[read];
            const leavingCount = leavingCounts.get(bucketMemberSlot);
            if (leavingCount === undefined || leavingCount === 0) {
                if (kept !== read) heldBucketMemberSlots[kept] = bucketMemberSlot;
                kept++;
                continue;
            }
            leavingCounts.set(bucketMemberSlot, leavingCount - 1);
            this.bucketArrayMembership.removeSlot(bucketMemberSlotsArrayStore, bucketMemberSlot);
            removedChannelQueue.enqueueEntry(bucketMemberSlot);
            removedAtChannelQueue.enqueueEntry(kept);
        }
        if (kept !== length) heldBucketMemberSlots.length = kept;
    }

    protected reconcileSlots(
        bucketSlot: TOIMBucketSlot<TSlots>, bucketMemberSlots: readonly TBucketMemberSlot[],
        arrivedChannelQueue: OIMChannelQueue<TOIMSlot>, departedChannelQueue: OIMChannelQueue<TOIMSlot>,
    ): void {
        const bucketMemberSlotsArrayStore = bucketSlot.bucketSlotsStore;
        if (this.bucketArrayMembership.containsTheSameSequence(bucketMemberSlotsArrayStore, bucketMemberSlots)) return;
        arrivedChannelQueue.keepFirstEntries(0);
        departedChannelQueue.keepFirstEntries(0);
        const heldBucketMemberSlots = bucketMemberSlotsArrayStore.bucketMemberSlots;
        for (let i = 0; i < heldBucketMemberSlots.length; i++) departedChannelQueue.enqueueEntry(heldBucketMemberSlots[i]);
        this.emptyBucketMemberSlotsStore(bucketMemberSlotsArrayStore);
        for (let i = 0; i < bucketMemberSlots.length; i++) {
            if (this.addSlot(bucketSlot, bucketMemberSlots[i])) arrivedChannelQueue.enqueueEntry(bucketMemberSlots[i]);
        }
    }

    protected drainSlots(bucketSlot: TOIMBucketSlot<TSlots>, departedChannelQueue: OIMChannelQueue<TOIMSlot>): void {
        const bucketMemberSlotsArrayStore = bucketSlot.bucketSlotsStore;
        const heldBucketMemberSlots = bucketMemberSlotsArrayStore.bucketMemberSlots;
        for (let i = 0; i < heldBucketMemberSlots.length; i++) departedChannelQueue.enqueueEntry(heldBucketMemberSlots[i]);
        this.emptyBucketMemberSlotsStore(bucketMemberSlotsArrayStore);
    }

    public hasBucketMemberSlot(bucketSlot: TOIMBucketSlot<TSlots>, bucketMemberSlot: TBucketMemberSlot): boolean {
        return this.bucketArrayMembership.hasSlot(bucketSlot.bucketSlotsStore, bucketMemberSlot);
    }

    public getBucketMemberSlotCount(bucketSlot: TOIMBucketSlot<TSlots>): number {
        return bucketSlot.bucketSlotsStore.bucketMemberSlots.length;
    }

    public getBucketMemberSlots(bucketSlot: TOIMBucketSlot<TSlots>): Iterable<TBucketMemberSlot> {
        return bucketSlot.bucketSlotsStore.bucketMemberSlots;
    }

    public getBucketMemberSlotAt(bucketSlot: TOIMBucketSlot<TSlots>, at: number): TBucketMemberSlot | undefined {
        return bucketSlot.bucketSlotsStore.bucketMemberSlots[at];
    }

    public getBucketMemberSlotPosition(bucketSlot: TOIMBucketSlot<TSlots>, bucketMemberSlot: TBucketMemberSlot): number {
        return bucketSlot.bucketSlotsStore.bucketMemberSlots.indexOf(bucketMemberSlot);
    }

    private emptyBucketMemberSlotsStore(bucketMemberSlotsArrayStore: TSlots): void {
        const bucketMemberSlots = bucketMemberSlotsArrayStore.bucketMemberSlots;
        if (bucketMemberSlots.length !== 0) bucketMemberSlots.length = 0;
        this.bucketArrayMembership.clearSlots(bucketMemberSlotsArrayStore);
    }
}

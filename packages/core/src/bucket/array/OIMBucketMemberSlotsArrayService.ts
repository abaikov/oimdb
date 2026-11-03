import type { TOIMSlot } from '../../slot/types/TOIMSlot';
import type { OIMChannelQueue } from '../../channel/OIMChannelQueue';
import type { TOIMBucketSlotsArrayStore } from './types/TOIMBucketSlotsArrayStore';
import type { IOIMBucketMemberSlotsArrayService } from './interfaces/IOIMBucketMemberSlotsArrayService';
import { OIM_NOTHING_WAS_REMOVED } from '../constants/OIM_NOTHING_WAS_REMOVED';
import { isOIMSameSlotSequence } from '../utils/isOIMSameSlotSequence';

const insertionTailLimit = 8;

export class OIMBucketMemberSlotsArrayService<TBucketMemberSlot extends TOIMSlot = TOIMSlot>
implements IOIMBucketMemberSlotsArrayService<TBucketMemberSlot> {
    public static readonly INSTANCE = new OIMBucketMemberSlotsArrayService();

    public createBucketSlotsArrayStore(): TOIMBucketSlotsArrayStore<TBucketMemberSlot> {
        return { bucketMemberSlots: [], uniqueBucketMemberSlots: undefined, sortedCount: 0 };
    }

    public hasBucketMemberSlot(bucketSlotsArrayStore: TOIMBucketSlotsArrayStore<TBucketMemberSlot>, bucketMemberSlot: TBucketMemberSlot): boolean {
        return bucketSlotsArrayStore.bucketMemberSlots.indexOf(bucketMemberSlot) >= 0;
    }

    public appendBucketMemberSlot(bucketSlotsArrayStore: TOIMBucketSlotsArrayStore<TBucketMemberSlot>, bucketMemberSlot: TBucketMemberSlot): boolean {
        bucketSlotsArrayStore.bucketMemberSlots.push(bucketMemberSlot);
        return true;
    }

    public insertBucketMemberSlotAt(
        bucketSlotsArrayStore: TOIMBucketSlotsArrayStore<TBucketMemberSlot>, at: number, bucketMemberSlot: TBucketMemberSlot,
    ): number {
        const bucketMemberSlots = bucketSlotsArrayStore.bucketMemberSlots;
        const landing = at < 0 ? 0 : at > bucketMemberSlots.length ? bucketMemberSlots.length : at;
        bucketMemberSlots.splice(landing, 0, bucketMemberSlot);
        return landing;
    }

    public removeBucketMemberSlot(bucketSlotsArrayStore: TOIMBucketSlotsArrayStore<TBucketMemberSlot>, bucketMemberSlot: TBucketMemberSlot): number {
        const bucketMemberSlots = bucketSlotsArrayStore.bucketMemberSlots;
        const at = bucketMemberSlots.indexOf(bucketMemberSlot);
        if (at < 0) return OIM_NOTHING_WAS_REMOVED;
        bucketMemberSlots.splice(at, 1);
        if (at < bucketSlotsArrayStore.sortedCount) bucketSlotsArrayStore.sortedCount--;
        return at;
    }

    public removeBucketMemberSlotAt(bucketSlotsArrayStore: TOIMBucketSlotsArrayStore<TBucketMemberSlot>, at: number): TBucketMemberSlot {
        if (at < bucketSlotsArrayStore.sortedCount) bucketSlotsArrayStore.sortedCount--;
        return bucketSlotsArrayStore.bucketMemberSlots.splice(at, 1)[0];
    }

    public removeBucketMemberSlotRange(
        bucketSlotsArrayStore: TOIMBucketSlotsArrayStore<TBucketMemberSlot>, at: number, count: number,
    ): TBucketMemberSlot[] {
        const removedBucketMemberSlots = bucketSlotsArrayStore.bucketMemberSlots.splice(at, count);
        const sortedCount = bucketSlotsArrayStore.sortedCount;
        if (at < sortedCount) bucketSlotsArrayStore.sortedCount = sortedCount - Math.min(removedBucketMemberSlots.length, sortedCount - at);
        return removedBucketMemberSlots;
    }

    public removeBucketMemberSlots(
        bucketSlotsArrayStore: TOIMBucketSlotsArrayStore<TBucketMemberSlot>, bucketMemberSlots: readonly TBucketMemberSlot[],
        removedChannelQueue: OIMChannelQueue<TOIMSlot>, removedAtChannelQueue: OIMChannelQueue<number>,
    ): void {
        if (bucketMemberSlots.length === 0) return;
        const leavingCounts = new Map<TBucketMemberSlot, number>();
        for (let i = 0; i < bucketMemberSlots.length; i++) {
            leavingCounts.set(bucketMemberSlots[i], (leavingCounts.get(bucketMemberSlots[i]) ?? 0) + 1);
        }
        const heldBucketMemberSlots = bucketSlotsArrayStore.bucketMemberSlots;
        const sortedCount = bucketSlotsArrayStore.sortedCount;
        const length = heldBucketMemberSlots.length;
        let removedFromSortedCount = 0;
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
            if (read < sortedCount) removedFromSortedCount++;
            removedChannelQueue.enqueueEntry(bucketMemberSlot);
            removedAtChannelQueue.enqueueEntry(kept);
        }
        if (kept !== length) heldBucketMemberSlots.length = kept;
        bucketSlotsArrayStore.sortedCount = sortedCount - removedFromSortedCount;
    }

    public moveBucketMemberSlotRange(
        bucketSlotsArrayStore: TOIMBucketSlotsArrayStore<TBucketMemberSlot>, from: number, count: number, landing: number,
    ): boolean {
        const bucketMemberSlots = bucketSlotsArrayStore.bucketMemberSlots;
        const firstTouched = from < landing ? from : landing;
        const pastTouched = (from > landing ? from : landing) + count;
        const touched = pastTouched - firstTouched;
        const leftShift = from < landing ? count : touched - count;
        if (leftShift === 0 || leftShift === touched) return false;
        let isChanged = false;
        for (let at = firstTouched; at < pastTouched; at++) {
            const after = firstTouched + ((at - firstTouched + leftShift) % touched);
            if (bucketMemberSlots[at] !== bucketMemberSlots[after]) {
                isChanged = true;
                break;
            }
        }
        if (!isChanged) return false;
        reverseRange(bucketMemberSlots, firstTouched, firstTouched + leftShift - 1);
        reverseRange(bucketMemberSlots, firstTouched + leftShift, pastTouched - 1);
        reverseRange(bucketMemberSlots, firstTouched, pastTouched - 1);
        return true;
    }

    public sortBucketMemberSlots(
        bucketSlotsArrayStore: TOIMBucketSlotsArrayStore<TBucketMemberSlot>,
        compareBucketMemberSlots: (left: TBucketMemberSlot, right: TBucketMemberSlot) => number,
    ): void {
        const bucketMemberSlots = bucketSlotsArrayStore.bucketMemberSlots;
        const length = bucketMemberSlots.length;
        const sortedCount = bucketSlotsArrayStore.sortedCount;
        if (length === sortedCount) return;
        if (length - sortedCount > insertionTailLimit) {
            bucketMemberSlots.sort(compareBucketMemberSlots);
            bucketSlotsArrayStore.sortedCount = length;
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
        bucketSlotsArrayStore.sortedCount = length;
    }

    public isSameBucketMemberSlotSequence(
        bucketSlotsArrayStore: TOIMBucketSlotsArrayStore<TBucketMemberSlot>, bucketMemberSlots: readonly TBucketMemberSlot[],
    ): boolean {
        return isOIMSameSlotSequence(bucketSlotsArrayStore.bucketMemberSlots, bucketMemberSlots);
    }

    public clearBucketMemberSlots(bucketSlotsArrayStore: TOIMBucketSlotsArrayStore<TBucketMemberSlot>): void {
        const bucketMemberSlots = bucketSlotsArrayStore.bucketMemberSlots;
        if (bucketMemberSlots.length !== 0) bucketMemberSlots.length = 0;
        bucketSlotsArrayStore.sortedCount = 0;
    }
}

function reverseRange<TBucketMemberSlot extends TOIMSlot>(bucketMemberSlots: TBucketMemberSlot[], first: number, last: number): void {
    for (let low = first, high = last; low < high; low++, high--) {
        const bucketMemberSlot = bucketMemberSlots[low];
        bucketMemberSlots[low] = bucketMemberSlots[high];
        bucketMemberSlots[high] = bucketMemberSlot;
    }
}

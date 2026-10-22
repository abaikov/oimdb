import type { IOIMBucketArrayMembership } from '../../engine/bucket/array/interfaces/IOIMBucketArrayMembership';
import type { TOIMBucketSlotsArrayStore } from '../../engine/bucket/array/types/TOIMBucketSlotsArrayStore';
import type { TOIMBucketSlot } from '../../engine/bucket/types/TOIMBucketSlot';
import type { TOIMBucketSlotOwnerService } from '../../engine/bucket/types/TOIMBucketSlotOwnerService';
import type { TOIMSlot } from '../../engine/slot/types/TOIMSlot';
import type { TOIMSlotContentBucketServiceOptions } from './types/TOIMSlotContentBucketServiceOptions';
import { OIMSlotContentBucketServiceArrayBased } from './OIMSlotContentBucketServiceArrayBased';
import { OIMBucketArrayMembershipNonUnique } from '../../engine/bucket/array/OIMBucketArrayMembershipNonUnique';
import { oimAssertWholePosition } from '../../engine/bucket/array/utils/oimAssertWholePosition';
import { oimUnholdSlotIfAlive } from '../../engine/slot/utils/oimUnholdSlotIfAlive';
import { oimGetChannelSlot } from '../../engine/slot/utils/oimGetChannelSlot';
import { OIM_FROZEN_EMPTY_SLOTS } from '../../engine/slot/constants/OIM_FROZEN_EMPTY_SLOTS';
import { OIMContentChangeDeliveryService } from '../../engine/slot/OIMContentChangeDeliveryService';

export class OIMSlotContentBucketServiceArrayDriven<
    TBucketMemberSlot extends TOIMSlot = TOIMSlot,
    TSlots extends TOIMBucketSlotsArrayStore<TBucketMemberSlot> = TOIMBucketSlotsArrayStore<TBucketMemberSlot>,
> extends OIMSlotContentBucketServiceArrayBased<TBucketMemberSlot, TSlots> {
    declare protected readonly bucketArrayMembership: IOIMBucketArrayMembership<TBucketMemberSlot, TSlots>;

    public constructor(
        options: TOIMSlotContentBucketServiceOptions & {
            bucketArrayMembership?: IOIMBucketArrayMembership<TBucketMemberSlot, TSlots> | undefined;
        } = {},
    ) {
        super(
            options,
            options.bucketArrayMembership
                ?? OIMBucketArrayMembershipNonUnique.INSTANCE as IOIMBucketArrayMembership<TOIMSlot, TOIMBucketSlotsArrayStore> as IOIMBucketArrayMembership<TBucketMemberSlot, TSlots>,
        );
    }

    protected createBucketMemberSlotsStore(): TSlots {
        return this.bucketArrayMembership.createStore();
    }

    public insertBucketMemberSlotAt(
        bucketSlot: TOIMBucketSlot<TSlots>,
        at: number, bucketMemberSlot: TBucketMemberSlot,
    ): void {
        const slotOwnerService = bucketSlot.owner as TOIMBucketSlotOwnerService<TSlots>;
        slotOwnerService.assertWritable(bucketSlot);
        oimAssertWholePosition(at);
        this.assertBucketMemberSlotNotReleased(bucketMemberSlot);
        const channelSlot = oimGetChannelSlot(bucketSlot);
        OIMContentChangeDeliveryService.INSTANCE.openContentSubframe(channelSlot);
        try {
            const bucketMemberSlotsArrayStore = bucketSlot.bucketSlotsStore;
            if (!this.bucketArrayMembership.addSlot(bucketMemberSlotsArrayStore, bucketMemberSlot)) return;
            const bucketMemberSlots = bucketMemberSlotsArrayStore.bucketMemberSlots;
            const landing = clampPosition(bucketMemberSlots.length, at);
            bucketMemberSlots.splice(landing, 0, bucketMemberSlot);
            bucketMemberSlot.owner.holdSlot(bucketMemberSlot);
            this.bucketCommands.recordInsert(bucketSlot, landing, bucketMemberSlot, bucketMemberSlots.length);
            this.markBucketSlotChanged(bucketSlot);
        } finally {
            OIMContentChangeDeliveryService.INSTANCE.closeContentSubframe(channelSlot);
        }
    }

    public removeBucketMemberSlotAt(
        bucketSlot: TOIMBucketSlot<TSlots>,
        at: number,
    ): TBucketMemberSlot | undefined {
        const slotOwnerService = bucketSlot.owner as TOIMBucketSlotOwnerService<TSlots>;
        slotOwnerService.assertWritable(bucketSlot);
        oimAssertWholePosition(at);
        const channelSlot = oimGetChannelSlot(bucketSlot);
        OIMContentChangeDeliveryService.INSTANCE.openContentSubframe(channelSlot);
        try {
            const bucketMemberSlotsArrayStore = bucketSlot.bucketSlotsStore;
            const bucketMemberSlots = bucketMemberSlotsArrayStore.bucketMemberSlots;
            if (at < 0 || at >= bucketMemberSlots.length) return undefined;
            const removedBucketMemberSlot = bucketMemberSlots[at];
            bucketMemberSlots.splice(at, 1);
            this.bucketArrayMembership.removeSlot(bucketMemberSlotsArrayStore, removedBucketMemberSlot);
            oimUnholdSlotIfAlive(removedBucketMemberSlot);
            this.bucketCommands.recordRemove(bucketSlot, at, 1, bucketMemberSlots.length);
            this.markBucketSlotChanged(bucketSlot);
            return removedBucketMemberSlot;
        } finally {
            OIMContentChangeDeliveryService.INSTANCE.closeContentSubframe(channelSlot);
        }
    }

    public removeBucketMemberSlotRange(
        bucketSlot: TOIMBucketSlot<TSlots>,
        at: number, count: number,
    ): readonly TBucketMemberSlot[] {
        const slotOwnerService = bucketSlot.owner as TOIMBucketSlotOwnerService<TSlots>;
        slotOwnerService.assertWritable(bucketSlot);
        oimAssertWholePosition(at);
        oimAssertWholePosition(count);
        const channelSlot = oimGetChannelSlot(bucketSlot);
        OIMContentChangeDeliveryService.INSTANCE.openContentSubframe(channelSlot);
        try {
            const bucketMemberSlotsArrayStore = bucketSlot.bucketSlotsStore;
            const bucketMemberSlots = bucketMemberSlotsArrayStore.bucketMemberSlots;
            if (at < 0 || count <= 0 || at >= bucketMemberSlots.length) return OIM_FROZEN_EMPTY_SLOTS;
            const removedBucketMemberSlots = bucketMemberSlots.splice(at, count);
            for (let i = 0; i < removedBucketMemberSlots.length; i++) {
                this.bucketArrayMembership.removeSlot(bucketMemberSlotsArrayStore, removedBucketMemberSlots[i]);
                oimUnholdSlotIfAlive(removedBucketMemberSlots[i]);
            }
            this.bucketCommands.recordRemove(bucketSlot, at, removedBucketMemberSlots.length, bucketMemberSlots.length);
            this.markBucketSlotChanged(bucketSlot);
            return removedBucketMemberSlots;
        } finally {
            OIMContentChangeDeliveryService.INSTANCE.closeContentSubframe(channelSlot);
        }
    }

    public moveBucketMemberSlotToPosition(
        bucketSlot: TOIMBucketSlot<TSlots>,
        from: number, to: number,
    ): TBucketMemberSlot | undefined {
        const slotOwnerService = bucketSlot.owner as TOIMBucketSlotOwnerService<TSlots>;
        slotOwnerService.assertWritable(bucketSlot);
        oimAssertWholePosition(from);
        oimAssertWholePosition(to);
        const channelSlot = oimGetChannelSlot(bucketSlot);
        OIMContentChangeDeliveryService.INSTANCE.openContentSubframe(channelSlot);
        try {
            const bucketMemberSlots = bucketSlot.bucketSlotsStore.bucketMemberSlots;
            if (from < 0 || from >= bucketMemberSlots.length || to < 0 || to >= bucketMemberSlots.length || from === to) return undefined;
            if (!moveRange(bucketMemberSlots, from, 1, to)) return undefined;
            this.bucketCommands.recordMove(bucketSlot, from, to, bucketMemberSlots.length);
            this.markBucketSlotChanged(bucketSlot);
            return bucketMemberSlots[to];
        } finally {
            OIMContentChangeDeliveryService.INSTANCE.closeContentSubframe(channelSlot);
        }
    }

    public moveBucketMemberSlotRangeToPosition(
        bucketSlot: TOIMBucketSlot<TSlots>,
        from: number, count: number, to: number,
    ): void {
        const slotOwnerService = bucketSlot.owner as TOIMBucketSlotOwnerService<TSlots>;
        slotOwnerService.assertWritable(bucketSlot);
        oimAssertWholePosition(from);
        oimAssertWholePosition(count);
        oimAssertWholePosition(to);
        const channelSlot = oimGetChannelSlot(bucketSlot);
        OIMContentChangeDeliveryService.INSTANCE.openContentSubframe(channelSlot);
        try {
            const bucketMemberSlots = bucketSlot.bucketSlotsStore.bucketMemberSlots;
            if (from < 0 || count <= 0 || from >= bucketMemberSlots.length) return;
            const taking = from + count > bucketMemberSlots.length ? bucketMemberSlots.length - from : count;
            const landing = clampPosition(bucketMemberSlots.length - taking, to);
            if (!moveRange(bucketMemberSlots, from, taking, landing)) return;
            this.bucketCommands.recordWholeList(bucketSlot);
            this.markBucketSlotChanged(bucketSlot);
        } finally {
            OIMContentChangeDeliveryService.INSTANCE.closeContentSubframe(channelSlot);
        }
    }
}

function clampPosition(length: number, at: number): number {
    return at < 0 ? 0 : at > length ? length : at;
}

function moveRange<TBucketMemberSlot extends TOIMSlot>(
    bucketMemberSlots: TBucketMemberSlot[], from: number, count: number, landing: number,
): boolean {
    const firstTouched = from < landing ? from : landing;
    const pastTouched = (from > landing ? from : landing) + count;
    const touched = pastTouched - firstTouched;
    const leftShift = from < landing ? count : touched - count;
    if (leftShift === 0 || leftShift === touched) return false;
    let changes = false;
    for (let at = firstTouched; at < pastTouched; at++) {
        const after = firstTouched + ((at - firstTouched + leftShift) % touched);
        if (bucketMemberSlots[at] !== bucketMemberSlots[after]) {
            changes = true;
            break;
        }
    }
    if (!changes) return false;
    reverse(bucketMemberSlots, firstTouched, firstTouched + leftShift - 1);
    reverse(bucketMemberSlots, firstTouched + leftShift, pastTouched - 1);
    reverse(bucketMemberSlots, firstTouched, pastTouched - 1);
    return true;
}

function reverse<TBucketMemberSlot extends TOIMSlot>(bucketMemberSlots: TBucketMemberSlot[], first: number, last: number): void {
    for (let low = first, high = last; low < high; low++, high--) {
        const bucketMemberSlot = bucketMemberSlots[low];
        bucketMemberSlots[low] = bucketMemberSlots[high];
        bucketMemberSlots[high] = bucketMemberSlot;
    }
}

import type { TOIMBucketSlotsArrayStore } from '../../engine/bucket/array/types/TOIMBucketSlotsArrayStore';
import type { TOIMBucketContentSlot } from '../../engine/bucket/types/TOIMBucketContentSlot';
import type { TOIMBucketSlotOwnerService } from '../../engine/bucket/types/TOIMBucketSlotOwnerService';
import type { TOIMSlot } from '../../engine/slot/types/TOIMSlot';
import type { TOIMStoreKey } from '../../engine/store/types/TOIMStoreKey';
import type { TOIMSlotContentArrayBucketServiceOptions } from './types/TOIMSlotContentArrayBucketServiceOptions';
import { OIMSlotContentArrayBucketService } from './OIMSlotContentArrayBucketService';
import { OIM_NOTHING_WAS_INSERTED } from '../../engine/bucket/constants/OIM_NOTHING_WAS_INSERTED';
import { oimAssertWholePosition } from '../../engine/bucket/array/utils/oimAssertWholePosition';
import { oimUnholdSlotIfAlive } from '../../engine/slot/utils/oimUnholdSlotIfAlive';
import { OIM_FROZEN_EMPTY_SLOTS } from '../../engine/slot/constants/OIM_FROZEN_EMPTY_SLOTS';

export class OIMSlotContentPositionalArrayBucketService<
    TBucketMemberSlot extends TOIMSlot = TOIMSlot, TKey extends NonNullable<unknown> = TOIMStoreKey,
> extends OIMSlotContentArrayBucketService<TBucketMemberSlot, TKey> {
    public constructor(options: TOIMSlotContentArrayBucketServiceOptions<TBucketMemberSlot> = {}) {
        super(options);
    }

    public insertBucketMemberSlotAt(
        bucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>,
        at: number, bucketMemberSlot: TBucketMemberSlot,
    ): void {
        const slotOwnerService = bucketSlot.owner as TOIMBucketSlotOwnerService<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>;
        slotOwnerService.assertWritable(bucketSlot);
        oimAssertWholePosition(at);
        this.assertBucketMemberSlotNotReleased(bucketMemberSlot);
        const bucketSlotsArrayStore = bucketSlot.bucketSlotsStore;
        const landing = this.bucketMemberSlotsArrayService.insertBucketMemberSlotAt(bucketSlotsArrayStore, at, bucketMemberSlot);
        if (landing === OIM_NOTHING_WAS_INSERTED) return;
        bucketMemberSlot.owner.holdSlot(bucketMemberSlot);
        this.bucketCommands.recordInsert(bucketSlot, landing, bucketMemberSlot, bucketSlotsArrayStore.bucketMemberSlots.length);
        this.markBucketSlotChanged(bucketSlot);
    }

    public removeBucketMemberSlotAt(
        bucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>,
        at: number,
    ): TBucketMemberSlot | undefined {
        const slotOwnerService = bucketSlot.owner as TOIMBucketSlotOwnerService<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>;
        slotOwnerService.assertWritable(bucketSlot);
        oimAssertWholePosition(at);
        const bucketSlotsArrayStore = bucketSlot.bucketSlotsStore;
        if (at < 0 || at >= bucketSlotsArrayStore.bucketMemberSlots.length) return undefined;
        const removedBucketMemberSlot = this.bucketMemberSlotsArrayService.removeBucketMemberSlotAt(bucketSlotsArrayStore, at);
        oimUnholdSlotIfAlive(removedBucketMemberSlot);
        this.bucketCommands.recordRemove(bucketSlot, at, 1, bucketSlotsArrayStore.bucketMemberSlots.length);
        this.markBucketSlotChanged(bucketSlot);
        return removedBucketMemberSlot;
    }

    public removeBucketMemberSlotRange(
        bucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>,
        at: number, count: number,
    ): readonly TBucketMemberSlot[] {
        const slotOwnerService = bucketSlot.owner as TOIMBucketSlotOwnerService<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>;
        slotOwnerService.assertWritable(bucketSlot);
        oimAssertWholePosition(at);
        oimAssertWholePosition(count);
        const bucketSlotsArrayStore = bucketSlot.bucketSlotsStore;
        if (at < 0 || count <= 0 || at >= bucketSlotsArrayStore.bucketMemberSlots.length) return OIM_FROZEN_EMPTY_SLOTS;
        const removedBucketMemberSlots = this.bucketMemberSlotsArrayService.removeBucketMemberSlotRange(bucketSlotsArrayStore, at, count);
        for (let i = 0; i < removedBucketMemberSlots.length; i++) oimUnholdSlotIfAlive(removedBucketMemberSlots[i]);
        this.bucketCommands.recordRemove(bucketSlot, at, removedBucketMemberSlots.length, bucketSlotsArrayStore.bucketMemberSlots.length);
        this.markBucketSlotChanged(bucketSlot);
        return removedBucketMemberSlots;
    }

    public moveBucketMemberSlotToPosition(
        bucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>,
        from: number, to: number,
    ): TBucketMemberSlot | undefined {
        const slotOwnerService = bucketSlot.owner as TOIMBucketSlotOwnerService<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>;
        slotOwnerService.assertWritable(bucketSlot);
        oimAssertWholePosition(from);
        oimAssertWholePosition(to);
        const bucketSlotsArrayStore = bucketSlot.bucketSlotsStore;
        const bucketMemberSlotCount = bucketSlotsArrayStore.bucketMemberSlots.length;
        if (from < 0 || from >= bucketMemberSlotCount || to < 0 || to >= bucketMemberSlotCount || from === to) return undefined;
        if (!this.bucketMemberSlotsArrayService.moveBucketMemberSlotRange(bucketSlotsArrayStore, from, 1, to)) return undefined;
        this.bucketCommands.recordMove(bucketSlot, from, to, bucketMemberSlotCount);
        this.markBucketSlotChanged(bucketSlot);
        return bucketSlotsArrayStore.bucketMemberSlots[to];
    }

    public moveBucketMemberSlotRangeToPosition(
        bucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>,
        from: number, count: number, to: number,
    ): void {
        const slotOwnerService = bucketSlot.owner as TOIMBucketSlotOwnerService<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>;
        slotOwnerService.assertWritable(bucketSlot);
        oimAssertWholePosition(from);
        oimAssertWholePosition(count);
        oimAssertWholePosition(to);
        const bucketSlotsArrayStore = bucketSlot.bucketSlotsStore;
        const bucketMemberSlotCount = bucketSlotsArrayStore.bucketMemberSlots.length;
        if (from < 0 || count <= 0 || from >= bucketMemberSlotCount) return;
        const taking = from + count > bucketMemberSlotCount ? bucketMemberSlotCount - from : count;
        const remaining = bucketMemberSlotCount - taking;
        const landing = to < 0 ? 0 : to > remaining ? remaining : to;
        if (!this.bucketMemberSlotsArrayService.moveBucketMemberSlotRange(bucketSlotsArrayStore, from, taking, landing)) return;
        this.bucketCommands.recordWholeList(bucketSlot);
        this.markBucketSlotChanged(bucketSlot);
    }
}

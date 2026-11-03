import type { OIMBucketSlot } from './OIMBucketSlot';
import type { TOIMBucketSlotsArrayStore } from './array/types/TOIMBucketSlotsArrayStore';
import type { TOIMBucketContentSlot } from './types/TOIMBucketContentSlot';
import type { TOIMBucketSlotOwnerService } from './types/TOIMBucketSlotOwnerService';
import type { TOIMSlot } from '../slot/types/TOIMSlot';
import type { TOIMStoreKey } from '../store/types/TOIMStoreKey';
import type { TOIMArrayBucketContentServiceOptions } from './types/TOIMArrayBucketContentServiceOptions';
import { OIMArrayBucketContentService } from './OIMArrayBucketContentService';
import { OIM_NOTHING_WAS_INSERTED } from './constants/OIM_NOTHING_WAS_INSERTED';
import { assertOIMWholePosition } from './array/utils/assertOIMWholePosition';
import { OIM_FROZEN_EMPTY_SLOTS } from '../slot/constants/OIM_FROZEN_EMPTY_SLOTS';
import { unholdOIMSlotIfAlive } from '../slot/utils/unholdOIMSlotIfAlive';

export class OIMPositionalArrayBucketContentService<
    TBucketMemberSlot extends TOIMSlot = TOIMSlot, TKey extends NonNullable<unknown> = TOIMStoreKey,
> extends OIMArrayBucketContentService<TBucketMemberSlot, TKey> {
    public constructor(options: TOIMArrayBucketContentServiceOptions<TBucketMemberSlot> = {}) {
        super(options);
    }

    public insertBucketMemberSlotAt(
        bucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>,
        at: number, bucketMemberSlot: TBucketMemberSlot,
    ): void {
        const slotOwnerService = bucketSlot.owner as TOIMBucketSlotOwnerService<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>;
        slotOwnerService.assertWritable(bucketSlot);
        assertOIMWholePosition(at);
        this.assertBucketMemberSlotNotReleased(bucketMemberSlot);
        const bucketSlotsArrayStore = (bucketSlot as unknown as OIMBucketSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>).bucketSlotsStore;
        const landing = this.bucketMemberSlotsArrayService.insertBucketMemberSlotAt(bucketSlotsArrayStore, at, bucketMemberSlot);
        if (landing === OIM_NOTHING_WAS_INSERTED) return;
        bucketMemberSlot.owner.holdSlot(bucketMemberSlot);
        this.bucketCommands.recordInsert(bucketSlot, landing, bucketMemberSlot, bucketSlotsArrayStore.bucketMemberSlots.length);
        this.announceBucketSlotChanged(bucketSlot);
    }

    public removeBucketMemberSlotAt(
        bucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>,
        at: number,
    ): TBucketMemberSlot | undefined {
        const slotOwnerService = bucketSlot.owner as TOIMBucketSlotOwnerService<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>;
        slotOwnerService.assertWritable(bucketSlot);
        assertOIMWholePosition(at);
        const bucketSlotsArrayStore = (bucketSlot as unknown as OIMBucketSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>).bucketSlotsStore;
        if (at < 0 || at >= bucketSlotsArrayStore.bucketMemberSlots.length) return undefined;
        const removedBucketMemberSlot = this.bucketMemberSlotsArrayService.removeBucketMemberSlotAt(bucketSlotsArrayStore, at);
        unholdOIMSlotIfAlive(removedBucketMemberSlot);
        this.bucketCommands.recordRemove(bucketSlot, at, 1, bucketSlotsArrayStore.bucketMemberSlots.length);
        this.announceBucketSlotChanged(bucketSlot);
        return removedBucketMemberSlot;
    }

    public removeBucketMemberSlotRange(
        bucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>,
        at: number, count: number,
    ): readonly TBucketMemberSlot[] {
        const slotOwnerService = bucketSlot.owner as TOIMBucketSlotOwnerService<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>;
        slotOwnerService.assertWritable(bucketSlot);
        assertOIMWholePosition(at);
        assertOIMWholePosition(count);
        const bucketSlotsArrayStore = (bucketSlot as unknown as OIMBucketSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>).bucketSlotsStore;
        if (at < 0 || count <= 0 || at >= bucketSlotsArrayStore.bucketMemberSlots.length) return OIM_FROZEN_EMPTY_SLOTS;
        const removedBucketMemberSlots = this.bucketMemberSlotsArrayService.removeBucketMemberSlotRange(bucketSlotsArrayStore, at, count);
        for (let i = 0; i < removedBucketMemberSlots.length; i++) unholdOIMSlotIfAlive(removedBucketMemberSlots[i]);
        this.bucketCommands.recordRemove(bucketSlot, at, removedBucketMemberSlots.length, bucketSlotsArrayStore.bucketMemberSlots.length);
        this.announceBucketSlotChanged(bucketSlot);
        return removedBucketMemberSlots;
    }

    public moveBucketMemberSlotToPosition(
        bucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>,
        from: number, to: number,
    ): TBucketMemberSlot | undefined {
        const slotOwnerService = bucketSlot.owner as TOIMBucketSlotOwnerService<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>;
        slotOwnerService.assertWritable(bucketSlot);
        assertOIMWholePosition(from);
        assertOIMWholePosition(to);
        const bucketSlotsArrayStore = (bucketSlot as unknown as OIMBucketSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>).bucketSlotsStore;
        const bucketMemberSlotCount = bucketSlotsArrayStore.bucketMemberSlots.length;
        if (from < 0 || from >= bucketMemberSlotCount || to < 0 || to >= bucketMemberSlotCount || from === to) return undefined;
        if (!this.bucketMemberSlotsArrayService.moveBucketMemberSlotRange(bucketSlotsArrayStore, from, 1, to)) return undefined;
        this.bucketCommands.recordMove(bucketSlot, from, to, bucketMemberSlotCount);
        this.announceBucketSlotChanged(bucketSlot);
        return bucketSlotsArrayStore.bucketMemberSlots[to];
    }

    public moveBucketMemberSlotRangeToPosition(
        bucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>,
        from: number, count: number, to: number,
    ): void {
        const slotOwnerService = bucketSlot.owner as TOIMBucketSlotOwnerService<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>;
        slotOwnerService.assertWritable(bucketSlot);
        assertOIMWholePosition(from);
        assertOIMWholePosition(count);
        assertOIMWholePosition(to);
        const bucketSlotsArrayStore = (bucketSlot as unknown as OIMBucketSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>).bucketSlotsStore;
        const bucketMemberSlotCount = bucketSlotsArrayStore.bucketMemberSlots.length;
        if (from < 0 || count <= 0 || from >= bucketMemberSlotCount) return;
        const taking = from + count > bucketMemberSlotCount ? bucketMemberSlotCount - from : count;
        const remaining = bucketMemberSlotCount - taking;
        const landing = to < 0 ? 0 : to > remaining ? remaining : to;
        if (!this.bucketMemberSlotsArrayService.moveBucketMemberSlotRange(bucketSlotsArrayStore, from, taking, landing)) return;
        this.bucketCommands.recordWholeList(bucketSlot);
        this.announceBucketSlotChanged(bucketSlot);
    }
}

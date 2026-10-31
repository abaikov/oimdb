import type { OIMBucketSlot } from './OIMBucketSlot';
import type { TOIMBucketSlotsArrayStore } from './array/types/TOIMBucketSlotsArrayStore';
import type { IOIMBucketMemberSlotsArrayService } from './array/interfaces/IOIMBucketMemberSlotsArrayService';
import type { TOIMBucketContentSlot } from './types/TOIMBucketContentSlot';
import type { TOIMSlot } from '../slot/types/TOIMSlot';
import type { TOIMStoreKey } from '../store/types/TOIMStoreKey';
import type { OIMChannelQueue } from '../channel/OIMChannelQueue';
import type { TOIMArrayBucketContentServiceOptions } from './types/TOIMArrayBucketContentServiceOptions';
import { OIMBucketContentService } from './OIMBucketContentService';
import { OIMBucketMemberSlotsArrayService } from './array/OIMBucketMemberSlotsArrayService';

export abstract class OIMArrayBucketContentService<
    TBucketMemberSlot extends TOIMSlot, TKey extends NonNullable<unknown> = TOIMStoreKey,
> extends OIMBucketContentService<TBucketMemberSlot, TOIMBucketSlotsArrayStore<TBucketMemberSlot>, TKey> {
    protected readonly bucketMemberSlotsArrayService: IOIMBucketMemberSlotsArrayService<TBucketMemberSlot>;

    protected constructor(options: TOIMArrayBucketContentServiceOptions<TBucketMemberSlot>) {
        super(options);
        this.bucketMemberSlotsArrayService = options.bucketMemberSlotsArrayService
            ?? OIMBucketMemberSlotsArrayService.INSTANCE as OIMBucketMemberSlotsArrayService<TBucketMemberSlot>;
    }

    protected createBucketMemberSlotsStore(): TOIMBucketSlotsArrayStore<TBucketMemberSlot> {
        return this.bucketMemberSlotsArrayService.createBucketSlotsArrayStore();
    }

    protected addSlot(bucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>, bucketMemberSlot: TBucketMemberSlot): boolean {
        return this.bucketMemberSlotsArrayService.appendBucketMemberSlot((bucketSlot as unknown as OIMBucketSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>).bucketSlotsStore, bucketMemberSlot);
    }

    protected removeSlot(bucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>, bucketMemberSlot: TBucketMemberSlot): number {
        return this.bucketMemberSlotsArrayService.removeBucketMemberSlot((bucketSlot as unknown as OIMBucketSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>).bucketSlotsStore, bucketMemberSlot);
    }

    protected removeSlots(
        bucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>, bucketMemberSlots: readonly TBucketMemberSlot[],
        removedChannelQueue: OIMChannelQueue<TOIMSlot>, removedAtChannelQueue: OIMChannelQueue<number>,
    ): void {
        this.bucketMemberSlotsArrayService.removeBucketMemberSlots(
            (bucketSlot as unknown as OIMBucketSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>).bucketSlotsStore, bucketMemberSlots, removedChannelQueue, removedAtChannelQueue,
        );
    }

    protected reconcileSlots(
        bucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>, bucketMemberSlots: readonly TBucketMemberSlot[],
        arrivedChannelQueue: OIMChannelQueue<TOIMSlot>, departedChannelQueue: OIMChannelQueue<TOIMSlot>,
    ): void {
        const bucketMemberSlotsArrayService = this.bucketMemberSlotsArrayService;
        const bucketSlotsArrayStore = (bucketSlot as unknown as OIMBucketSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>).bucketSlotsStore;
        if (bucketMemberSlotsArrayService.isSameBucketMemberSlotSequence(bucketSlotsArrayStore, bucketMemberSlots)) return;
        arrivedChannelQueue.keepFirstEntries(0);
        departedChannelQueue.keepFirstEntries(0);
        const heldBucketMemberSlots = bucketSlotsArrayStore.bucketMemberSlots;
        for (let i = 0; i < heldBucketMemberSlots.length; i++) departedChannelQueue.enqueueEntry(heldBucketMemberSlots[i]);
        bucketMemberSlotsArrayService.clearBucketMemberSlots(bucketSlotsArrayStore);
        for (let i = 0; i < bucketMemberSlots.length; i++) {
            if (bucketMemberSlotsArrayService.appendBucketMemberSlot(bucketSlotsArrayStore, bucketMemberSlots[i])) {
                arrivedChannelQueue.enqueueEntry(bucketMemberSlots[i]);
            }
        }
    }

    protected drainSlots(
        bucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>, departedChannelQueue: OIMChannelQueue<TOIMSlot>,
    ): void {
        const bucketSlotsArrayStore = (bucketSlot as unknown as OIMBucketSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>).bucketSlotsStore;
        const heldBucketMemberSlots = bucketSlotsArrayStore.bucketMemberSlots;
        for (let i = 0; i < heldBucketMemberSlots.length; i++) departedChannelQueue.enqueueEntry(heldBucketMemberSlots[i]);
        this.bucketMemberSlotsArrayService.clearBucketMemberSlots(bucketSlotsArrayStore);
    }

    /** @deprecated Use `slot.hasBucketMemberSlot(…)`; removed in 5.0. */
    public hasBucketMemberSlot(bucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>, bucketMemberSlot: TBucketMemberSlot): boolean {
        return this.bucketMemberSlotsArrayService.hasBucketMemberSlot((bucketSlot as unknown as OIMBucketSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>).bucketSlotsStore, bucketMemberSlot);
    }

    /** @deprecated Use `slot.getBucketMemberSlotCount(…)`; removed in 5.0. */
    public getBucketMemberSlotCount(bucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>): number {
        return (bucketSlot as unknown as OIMBucketSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>).bucketSlotsStore.bucketMemberSlots.length;
    }

    /** @deprecated Use `slot.getBucketMemberSlots(…)`; removed in 5.0. */
    public getBucketMemberSlots(bucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>): Iterable<TBucketMemberSlot> {
        return (bucketSlot as unknown as OIMBucketSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>).bucketSlotsStore.bucketMemberSlots;
    }

    public getBucketMemberSlotAt(
        bucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>, at: number,
    ): TBucketMemberSlot | undefined {
        return (bucketSlot as unknown as OIMBucketSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>).bucketSlotsStore.bucketMemberSlots[at];
    }

    public getBucketMemberSlotPosition(
        bucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>, bucketMemberSlot: TBucketMemberSlot,
    ): number {
        return (bucketSlot as unknown as OIMBucketSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>).bucketSlotsStore.bucketMemberSlots.indexOf(bucketMemberSlot);
    }
}

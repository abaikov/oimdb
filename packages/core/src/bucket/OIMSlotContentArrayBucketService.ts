import type { TOIMBucketSlotsArrayStore } from './array/types/TOIMBucketSlotsArrayStore';
import type { IOIMBucketMemberSlotsArrayService } from './array/interfaces/IOIMBucketMemberSlotsArrayService';
import type { TOIMBucketContentSlot } from './types/TOIMBucketContentSlot';
import type { TOIMSlot } from '../slot/types/TOIMSlot';
import type { TOIMStoreKey } from '../store/types/TOIMStoreKey';
import type { OIMChannelQueue } from '../channel/OIMChannelQueue';
import type { TOIMSlotContentArrayBucketServiceOptions } from './types/TOIMSlotContentArrayBucketServiceOptions';
import { OIMSlotContentBucketService } from './OIMSlotContentBucketService';
import { OIMBucketMemberSlotsArrayService } from './array/OIMBucketMemberSlotsArrayService';

export abstract class OIMSlotContentArrayBucketService<
    TBucketMemberSlot extends TOIMSlot, TKey extends NonNullable<unknown> = TOIMStoreKey,
> extends OIMSlotContentBucketService<TBucketMemberSlot, TOIMBucketSlotsArrayStore<TBucketMemberSlot>, TKey> {
    protected readonly bucketMemberSlotsArrayService: IOIMBucketMemberSlotsArrayService<TBucketMemberSlot>;

    protected constructor(options: TOIMSlotContentArrayBucketServiceOptions<TBucketMemberSlot>) {
        super(options);
        this.bucketMemberSlotsArrayService = options.bucketMemberSlotsArrayService
            ?? OIMBucketMemberSlotsArrayService.INSTANCE as OIMBucketMemberSlotsArrayService<TBucketMemberSlot>;
    }

    protected createBucketMemberSlotsStore(): TOIMBucketSlotsArrayStore<TBucketMemberSlot> {
        return this.bucketMemberSlotsArrayService.createBucketSlotsArrayStore();
    }

    protected addSlot(bucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>, bucketMemberSlot: TBucketMemberSlot): boolean {
        return this.bucketMemberSlotsArrayService.appendBucketMemberSlot(bucketSlot.bucketSlotsStore, bucketMemberSlot);
    }

    protected removeSlot(bucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>, bucketMemberSlot: TBucketMemberSlot): number {
        return this.bucketMemberSlotsArrayService.removeBucketMemberSlot(bucketSlot.bucketSlotsStore, bucketMemberSlot);
    }

    protected removeSlots(
        bucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>, bucketMemberSlots: readonly TBucketMemberSlot[],
        removedChannelQueue: OIMChannelQueue<TOIMSlot>, removedAtChannelQueue: OIMChannelQueue<number>,
    ): void {
        this.bucketMemberSlotsArrayService.removeBucketMemberSlots(
            bucketSlot.bucketSlotsStore, bucketMemberSlots, removedChannelQueue, removedAtChannelQueue,
        );
    }

    protected reconcileSlots(
        bucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>, bucketMemberSlots: readonly TBucketMemberSlot[],
        arrivedChannelQueue: OIMChannelQueue<TOIMSlot>, departedChannelQueue: OIMChannelQueue<TOIMSlot>,
    ): void {
        const bucketMemberSlotsArrayService = this.bucketMemberSlotsArrayService;
        const bucketSlotsArrayStore = bucketSlot.bucketSlotsStore;
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
        const bucketSlotsArrayStore = bucketSlot.bucketSlotsStore;
        const heldBucketMemberSlots = bucketSlotsArrayStore.bucketMemberSlots;
        for (let i = 0; i < heldBucketMemberSlots.length; i++) departedChannelQueue.enqueueEntry(heldBucketMemberSlots[i]);
        this.bucketMemberSlotsArrayService.clearBucketMemberSlots(bucketSlotsArrayStore);
    }

    public hasBucketMemberSlot(bucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>, bucketMemberSlot: TBucketMemberSlot): boolean {
        return this.bucketMemberSlotsArrayService.hasBucketMemberSlot(bucketSlot.bucketSlotsStore, bucketMemberSlot);
    }

    public getBucketMemberSlotCount(bucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>): number {
        return bucketSlot.bucketSlotsStore.bucketMemberSlots.length;
    }

    public getBucketMemberSlots(bucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>): Iterable<TBucketMemberSlot> {
        return bucketSlot.bucketSlotsStore.bucketMemberSlots;
    }

    public getBucketMemberSlotAt(
        bucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>, at: number,
    ): TBucketMemberSlot | undefined {
        return bucketSlot.bucketSlotsStore.bucketMemberSlots[at];
    }

    public getBucketMemberSlotPosition(
        bucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>, bucketMemberSlot: TBucketMemberSlot,
    ): number {
        return bucketSlot.bucketSlotsStore.bucketMemberSlots.indexOf(bucketMemberSlot);
    }
}

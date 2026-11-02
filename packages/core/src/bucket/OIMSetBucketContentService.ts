import type { TOIMBucketContentSlot } from './types/TOIMBucketContentSlot';
import type { TOIMBucketSlotsSetStore } from './types/TOIMBucketSlotsSetStore';
import type { TOIMSlot } from '../slot/types/TOIMSlot';
import type { TOIMStoreKey } from '../store/types/TOIMStoreKey';
import type { OIMChannelQueue } from '../channel/OIMChannelQueue';
import type { TOIMBucketContentServiceOptions } from './types/TOIMBucketContentServiceOptions';
import { OIMBucketContentService } from './OIMBucketContentService';
import { OIMBucketMemberSlotsSetService } from './set/OIMBucketMemberSlotsSetService';
import { oimGetBucketSlotsSetStore } from './utils/oimGetBucketSlotsSetStore';

export class OIMSetBucketContentService<
    TBucketMemberSlot extends TOIMSlot = TOIMSlot, TKey extends NonNullable<unknown> = TOIMStoreKey,
> extends OIMBucketContentService<TBucketMemberSlot, TOIMBucketSlotsSetStore<TBucketMemberSlot>, TKey> {
    private readonly bucketMemberSlotsSetService = OIMBucketMemberSlotsSetService.INSTANCE as OIMBucketMemberSlotsSetService<TBucketMemberSlot>;

    public constructor(options: TOIMBucketContentServiceOptions = {}) {
        super(options);
    }

    protected createBucketMemberSlotsStore(): TOIMBucketSlotsSetStore<TBucketMemberSlot> {
        return this.bucketMemberSlotsSetService.createBucketSlotsSetStore();
    }

    protected addSlot(bucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsSetStore<TBucketMemberSlot>>, bucketMemberSlot: TBucketMemberSlot): boolean {
        return this.bucketMemberSlotsSetService.addBucketMemberSlot(oimGetBucketSlotsSetStore(bucketSlot), bucketMemberSlot);
    }

    protected removeSlot(bucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsSetStore<TBucketMemberSlot>>, bucketMemberSlot: TBucketMemberSlot): number {
        return this.bucketMemberSlotsSetService.removeBucketMemberSlot(oimGetBucketSlotsSetStore(bucketSlot), bucketMemberSlot);
    }

    protected removeSlots(
        bucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsSetStore<TBucketMemberSlot>>, bucketMemberSlots: readonly TBucketMemberSlot[],
        removedChannelQueue: OIMChannelQueue<TOIMSlot>, removedAtChannelQueue: OIMChannelQueue<number>,
    ): void {
        this.bucketMemberSlotsSetService.removeBucketMemberSlots(oimGetBucketSlotsSetStore(bucketSlot), bucketMemberSlots, removedChannelQueue, removedAtChannelQueue);
    }

    protected reconcileSlots(
        bucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsSetStore<TBucketMemberSlot>>, bucketMemberSlots: readonly TBucketMemberSlot[],
        arrivedChannelQueue: OIMChannelQueue<TOIMSlot>, departedChannelQueue: OIMChannelQueue<TOIMSlot>,
    ): void {
        this.bucketMemberSlotsSetService.reconcileBucketMemberSlots(oimGetBucketSlotsSetStore(bucketSlot), bucketMemberSlots, arrivedChannelQueue, departedChannelQueue);
    }

    protected drainSlots(bucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsSetStore<TBucketMemberSlot>>, departedChannelQueue: OIMChannelQueue<TOIMSlot>): void {
        this.bucketMemberSlotsSetService.drainBucketMemberSlots(oimGetBucketSlotsSetStore(bucketSlot), departedChannelQueue);
    }

    /** @deprecated Use `slot.hasBucketMemberSlot(…)`; removed in 5.0. */
    public hasBucketMemberSlot(bucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsSetStore<TBucketMemberSlot>>, bucketMemberSlot: TBucketMemberSlot): boolean {
        return this.bucketMemberSlotsSetService.hasBucketMemberSlot(oimGetBucketSlotsSetStore(bucketSlot), bucketMemberSlot);
    }

    /** @deprecated Use `slot.getBucketMemberSlotCount(…)`; removed in 5.0. */
    public getBucketMemberSlotCount(bucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsSetStore<TBucketMemberSlot>>): number {
        return this.bucketMemberSlotsSetService.getBucketMemberSlotCount(oimGetBucketSlotsSetStore(bucketSlot));
    }

    /** @deprecated Use `slot.getBucketMemberSlots(…)`; removed in 5.0. */
    public getBucketMemberSlots(bucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsSetStore<TBucketMemberSlot>>): Iterable<TBucketMemberSlot> {
        return this.bucketMemberSlotsSetService.getBucketMemberSlots(oimGetBucketSlotsSetStore(bucketSlot));
    }
}

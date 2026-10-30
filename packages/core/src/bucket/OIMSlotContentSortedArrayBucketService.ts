import type { TOIMBucketSlotsArrayStore } from './array/types/TOIMBucketSlotsArrayStore';
import type { TOIMBucketContentSlot } from './types/TOIMBucketContentSlot';
import type { TOIMBucketSlotOwnerService } from './types/TOIMBucketSlotOwnerService';
import type { TOIMSlot } from '../slot/types/TOIMSlot';
import type { TOIMStoreKey } from '../store/types/TOIMStoreKey';
import type { OIMChannelQueue } from '../channel/OIMChannelQueue';
import type { TOIMSlotContentSortedArrayBucketServiceOptions } from './types/TOIMSlotContentSortedArrayBucketServiceOptions';
import { OIMSlotContentArrayBucketService } from './OIMSlotContentArrayBucketService';
import { OIM_NOTHING_WAS_REMOVED } from './constants/OIM_NOTHING_WAS_REMOVED';

export class OIMSlotContentSortedArrayBucketService<
    TBucketMemberSlot extends TOIMSlot = TOIMSlot, TKey extends NonNullable<unknown> = TOIMStoreKey,
> extends OIMSlotContentArrayBucketService<TBucketMemberSlot, TKey> {
    private readonly compareBucketMemberSlots: (left: TBucketMemberSlot, right: TBucketMemberSlot) => number;

    public constructor(options: TOIMSlotContentSortedArrayBucketServiceOptions<TBucketMemberSlot>) {
        super(options);
        this.compareBucketMemberSlots = options.compareBucketMemberSlots;
    }

    protected override drainSlots(
        bucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>, departedChannelQueue: OIMChannelQueue<TOIMSlot>,
    ): void {
        this.bucketMemberSlotsArrayService.sortBucketMemberSlots(bucketSlot.bucketSlotsStore, this.compareBucketMemberSlots);
        super.drainSlots(bucketSlot, departedChannelQueue);
    }

    public override getBucketMemberSlots(
        bucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>,
    ): Iterable<TBucketMemberSlot> {
        this.bucketMemberSlotsArrayService.sortBucketMemberSlots(bucketSlot.bucketSlotsStore, this.compareBucketMemberSlots);
        return super.getBucketMemberSlots(bucketSlot);
    }

    public override getBucketMemberSlotAt(
        bucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>, at: number,
    ): TBucketMemberSlot | undefined {
        this.bucketMemberSlotsArrayService.sortBucketMemberSlots(bucketSlot.bucketSlotsStore, this.compareBucketMemberSlots);
        return super.getBucketMemberSlotAt(bucketSlot, at);
    }

    public override getBucketMemberSlotPosition(
        bucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>, bucketMemberSlot: TBucketMemberSlot,
    ): number {
        this.bucketMemberSlotsArrayService.sortBucketMemberSlots(bucketSlot.bucketSlotsStore, this.compareBucketMemberSlots);
        return super.getBucketMemberSlotPosition(bucketSlot, bucketMemberSlot);
    }

    public repositionBucketMemberSlot(
        bucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>,
        bucketMemberSlot: TBucketMemberSlot,
    ): void {
        const slotOwnerService = bucketSlot.owner as TOIMBucketSlotOwnerService<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>;
        slotOwnerService.assertWritable(bucketSlot);
        if (this.removeSlot(bucketSlot, bucketMemberSlot) === OIM_NOTHING_WAS_REMOVED) return;
        if (this.addSlot(bucketSlot, bucketMemberSlot)) this.markBucketSlotChanged(bucketSlot);
    }
}

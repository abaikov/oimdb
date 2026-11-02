import type { OIMBucketSlot } from './OIMBucketSlot';
import type { TOIMBucketSlotsArrayStore } from './array/types/TOIMBucketSlotsArrayStore';
import type { TOIMBucketContentSlot } from './types/TOIMBucketContentSlot';
import type { TOIMBucketSlotOwnerService } from './types/TOIMBucketSlotOwnerService';
import type { TOIMSlot } from '../slot/types/TOIMSlot';
import type { TOIMStoreKey } from '../store/types/TOIMStoreKey';
import type { TOIMSortedArrayBucketContentServiceOptions } from './types/TOIMSortedArrayBucketContentServiceOptions';
import { OIMArrayBucketContentService } from './OIMArrayBucketContentService';
import { OIM_NOTHING_WAS_REMOVED } from './constants/OIM_NOTHING_WAS_REMOVED';

export class OIMSortedArrayBucketContentService<
    TBucketMemberSlot extends TOIMSlot = TOIMSlot, TKey extends NonNullable<unknown> = TOIMStoreKey,
> extends OIMArrayBucketContentService<TBucketMemberSlot, TKey> {
    private readonly compareBucketMemberSlots: (left: TBucketMemberSlot, right: TBucketMemberSlot) => number;

    public constructor(options: TOIMSortedArrayBucketContentServiceOptions<TBucketMemberSlot>) {
        super({ bucketMemberSlotsArrayService: options.bucketMemberSlotsArrayService });
        this.compareBucketMemberSlots = options.compareBucketMemberSlots;
    }

    public override getBucketMemberSlots(
        bucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>,
    ): Iterable<TBucketMemberSlot> {
        this.bucketMemberSlotsArrayService.sortBucketMemberSlots((bucketSlot as unknown as OIMBucketSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>).bucketSlotsStore, this.compareBucketMemberSlots);
        return super.getBucketMemberSlots(bucketSlot);
    }

    public override getBucketMemberSlotAt(
        bucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>, at: number,
    ): TBucketMemberSlot | undefined {
        this.bucketMemberSlotsArrayService.sortBucketMemberSlots((bucketSlot as unknown as OIMBucketSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>).bucketSlotsStore, this.compareBucketMemberSlots);
        return super.getBucketMemberSlotAt(bucketSlot, at);
    }

    public override getBucketMemberSlotPosition(
        bucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>, bucketMemberSlot: TBucketMemberSlot,
    ): number {
        this.bucketMemberSlotsArrayService.sortBucketMemberSlots((bucketSlot as unknown as OIMBucketSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>).bucketSlotsStore, this.compareBucketMemberSlots);
        return super.getBucketMemberSlotPosition(bucketSlot, bucketMemberSlot);
    }

    public repositionBucketMemberSlot(
        bucketSlot: TOIMBucketContentSlot<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>,
        bucketMemberSlot: TBucketMemberSlot,
    ): void {
        const slotOwnerService = bucketSlot.owner as TOIMBucketSlotOwnerService<TOIMBucketSlotsArrayStore<TBucketMemberSlot>>;
        slotOwnerService.assertWritable(bucketSlot);
        if (this.removeSlot(bucketSlot, bucketMemberSlot) === OIM_NOTHING_WAS_REMOVED) return;
        if (this.addSlot(bucketSlot, bucketMemberSlot)) this.announceBucketSlotChanged(bucketSlot);
    }
}

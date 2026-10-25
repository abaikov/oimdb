import type { TOIMSlot } from '../../../slot/types/TOIMSlot';
import type { OIMChannelQueue } from '../../../channel/OIMChannelQueue';
import type { TOIMBucketSlotsArrayStore } from '../types/TOIMBucketSlotsArrayStore';

export interface IOIMBucketMemberSlotsArrayService<TBucketMemberSlot extends TOIMSlot = TOIMSlot> {
    createBucketSlotsArrayStore(): TOIMBucketSlotsArrayStore<TBucketMemberSlot>;
    hasBucketMemberSlot(bucketSlotsArrayStore: TOIMBucketSlotsArrayStore<TBucketMemberSlot>, bucketMemberSlot: TBucketMemberSlot): boolean;
    appendBucketMemberSlot(bucketSlotsArrayStore: TOIMBucketSlotsArrayStore<TBucketMemberSlot>, bucketMemberSlot: TBucketMemberSlot): boolean;
    insertBucketMemberSlotAt(
        bucketSlotsArrayStore: TOIMBucketSlotsArrayStore<TBucketMemberSlot>, at: number, bucketMemberSlot: TBucketMemberSlot,
    ): number;
    removeBucketMemberSlot(bucketSlotsArrayStore: TOIMBucketSlotsArrayStore<TBucketMemberSlot>, bucketMemberSlot: TBucketMemberSlot): number;
    removeBucketMemberSlotAt(bucketSlotsArrayStore: TOIMBucketSlotsArrayStore<TBucketMemberSlot>, at: number): TBucketMemberSlot;
    removeBucketMemberSlotRange(bucketSlotsArrayStore: TOIMBucketSlotsArrayStore<TBucketMemberSlot>, at: number, count: number): TBucketMemberSlot[];
    removeBucketMemberSlots(
        bucketSlotsArrayStore: TOIMBucketSlotsArrayStore<TBucketMemberSlot>, bucketMemberSlots: readonly TBucketMemberSlot[],
        removedChannelQueue: OIMChannelQueue<TOIMSlot>, removedAtChannelQueue: OIMChannelQueue<number>,
    ): void;
    moveBucketMemberSlotRange(
        bucketSlotsArrayStore: TOIMBucketSlotsArrayStore<TBucketMemberSlot>, from: number, count: number, landing: number,
    ): boolean;
    sortBucketMemberSlots(
        bucketSlotsArrayStore: TOIMBucketSlotsArrayStore<TBucketMemberSlot>,
        compareBucketMemberSlots: (left: TBucketMemberSlot, right: TBucketMemberSlot) => number,
    ): void;
    isSameBucketMemberSlotSequence(
        bucketSlotsArrayStore: TOIMBucketSlotsArrayStore<TBucketMemberSlot>, bucketMemberSlots: readonly TBucketMemberSlot[],
    ): boolean;
    clearBucketMemberSlots(bucketSlotsArrayStore: TOIMBucketSlotsArrayStore<TBucketMemberSlot>): void;
}

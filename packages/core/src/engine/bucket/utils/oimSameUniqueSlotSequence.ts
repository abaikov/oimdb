import type { TOIMSlot } from '../../slot/types/TOIMSlot';

export function oimSameUniqueSlotSequence<TBucketMemberSlot extends TOIMSlot>(
    heldBucketMemberSlots: readonly TBucketMemberSlot[],
    bucketMemberSlots: readonly TBucketMemberSlot[],
): boolean {
    const seenBucketMemberSlots = new Set<TBucketMemberSlot>();
    let at = 0;
    for (let i = 0; i < bucketMemberSlots.length; i++) {
        const bucketMemberSlot = bucketMemberSlots[i];
        if (seenBucketMemberSlots.has(bucketMemberSlot)) continue;
        seenBucketMemberSlots.add(bucketMemberSlot);
        if (at >= heldBucketMemberSlots.length || heldBucketMemberSlots[at] !== bucketMemberSlot) return false;
        at++;
    }
    return at === heldBucketMemberSlots.length;
}

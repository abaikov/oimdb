import type { TOIMBucketContentSlot } from '../types/TOIMBucketContentSlot';
import type { TOIMBucketSlotOwnerService } from '../types/TOIMBucketSlotOwnerService';
import { peekOIMChannelSlot } from '../../slot/utils/peekOIMChannelSlot';

export function markOIMBucketMembershipChanged<TSlots>(bucketSlot: TOIMBucketContentSlot<TSlots>, isEmpty: boolean): void {
    const slotOwnerService = bucketSlot.owner as TOIMBucketSlotOwnerService<TSlots>;
    if (slotOwnerService.hasColumnSlots(bucketSlot)) {
        slotOwnerService.columnSlotOwner.markColumnsChanged(bucketSlot, undefined, undefined, peekOIMChannelSlot(bucketSlot));
    }
    slotOwnerService.markSlotContentChanged(bucketSlot, isEmpty);
}

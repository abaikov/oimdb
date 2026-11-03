import type { TOIMBucketContentSlot } from '../types/TOIMBucketContentSlot';
import type { TOIMBucketSlotOwnerService } from '../types/TOIMBucketSlotOwnerService';
import { peekOIMChannelSlot } from '../../slot/utils/peekOIMChannelSlot';

export function markOIMBucketColumnsChanged<TSlots>(
    bucketSlot: TOIMBucketContentSlot<TSlots>, patch: object | undefined, changedColumns: readonly string[] | undefined,
): void {
    const slotOwnerService = bucketSlot.owner as TOIMBucketSlotOwnerService<TSlots>;
    slotOwnerService.assertWritable(bucketSlot);
    if (!slotOwnerService.hasColumnSlots(bucketSlot)) return;
    slotOwnerService.columnSlotOwner.markColumnsChanged(bucketSlot, patch, changedColumns, peekOIMChannelSlot(bucketSlot));
}

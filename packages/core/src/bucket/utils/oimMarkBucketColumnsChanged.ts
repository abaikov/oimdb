import type { TOIMBucketContentSlot } from '../types/TOIMBucketContentSlot';
import type { TOIMBucketSlotOwnerService } from '../types/TOIMBucketSlotOwnerService';
import { oimGetChannelSlot } from '../../slot/utils/oimGetChannelSlot';

export function oimMarkBucketColumnsChanged<TSlots>(
    bucketSlot: TOIMBucketContentSlot<TSlots>, patch: object | undefined, changedColumns: readonly string[] | undefined,
): void {
    const slotOwnerService = bucketSlot.owner as TOIMBucketSlotOwnerService<TSlots>;
    slotOwnerService.assertWritable(bucketSlot);
    if (!slotOwnerService.hasColumnSlots(bucketSlot)) return;
    slotOwnerService.columnSlotOwner.markColumnsChanged(bucketSlot, patch, changedColumns, oimGetChannelSlot(bucketSlot));
}

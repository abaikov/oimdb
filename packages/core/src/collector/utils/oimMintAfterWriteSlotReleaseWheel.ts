import type { TOIMCollectorSlot } from '../types/TOIMCollectorSlot';
import { OIMSlotReleaseWheel } from '../OIMSlotReleaseWheel';
import { OIM_SLOT_FLAG_RELEASE_SCHEDULED_AFTER_WRITE } from '../constants/OIM_SLOT_FLAG_RELEASE_SCHEDULED_AFTER_WRITE';
import { oimGetReleaseDueAfterWriteMs } from '../../slot/utils/oimGetReleaseDueAfterWriteMs';
import { oimSetReleaseDueAfterWriteMs } from '../../slot/utils/oimSetReleaseDueAfterWriteMs';

export function oimMintAfterWriteSlotReleaseWheel(collectorSlot: TOIMCollectorSlot): OIMSlotReleaseWheel {
    return collectorSlot.afterWriteSlotReleaseWheel ??= new OIMSlotReleaseWheel({
        ...collectorSlot.slotWheelOptions,
        getReleaseDueMs: oimGetReleaseDueAfterWriteMs,
        setReleaseDueMs: oimSetReleaseDueAfterWriteMs,
        releaseScheduledSlotFlag: OIM_SLOT_FLAG_RELEASE_SCHEDULED_AFTER_WRITE,
    });
}

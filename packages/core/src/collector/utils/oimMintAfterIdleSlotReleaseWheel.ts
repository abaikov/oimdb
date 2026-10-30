import type { TOIMCollectorSlot } from '../types/TOIMCollectorSlot';
import { OIMSlotReleaseWheel } from '../OIMSlotReleaseWheel';
import { OIM_SLOT_FLAG_RELEASE_SCHEDULED_AFTER_IDLE } from '../constants/OIM_SLOT_FLAG_RELEASE_SCHEDULED_AFTER_IDLE';
import { oimGetReleaseDueAfterIdleMs } from '../../slot/utils/oimGetReleaseDueAfterIdleMs';
import { oimSetReleaseDueAfterIdleMs } from '../../slot/utils/oimSetReleaseDueAfterIdleMs';

export function oimMintAfterIdleSlotReleaseWheel(collectorSlot: TOIMCollectorSlot): OIMSlotReleaseWheel {
    return collectorSlot.afterIdleSlotReleaseWheel ??= new OIMSlotReleaseWheel({
        ...collectorSlot.slotWheelOptions,
        getReleaseDueMs: oimGetReleaseDueAfterIdleMs,
        setReleaseDueMs: oimSetReleaseDueAfterIdleMs,
        releaseScheduledSlotFlag: OIM_SLOT_FLAG_RELEASE_SCHEDULED_AFTER_IDLE,
    });
}

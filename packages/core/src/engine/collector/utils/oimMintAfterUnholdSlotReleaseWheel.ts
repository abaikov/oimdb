import type { TOIMCollectorSlot } from '../types/TOIMCollectorSlot';
import { OIMSlotReleaseWheel } from '../OIMSlotReleaseWheel';
import { OIM_SLOT_FLAG_RELEASE_SCHEDULED_AFTER_UNHOLD } from '../constants/OIM_SLOT_FLAG_RELEASE_SCHEDULED_AFTER_UNHOLD';
import { oimGetReleaseDueAfterUnholdMs } from '../../slot/utils/oimGetReleaseDueAfterUnholdMs';
import { oimSetReleaseDueAfterUnholdMs } from '../../slot/utils/oimSetReleaseDueAfterUnholdMs';

export function oimMintAfterUnholdSlotReleaseWheel(collectorSlot: TOIMCollectorSlot): OIMSlotReleaseWheel {
    return collectorSlot.afterUnholdSlotReleaseWheel ??= new OIMSlotReleaseWheel({
        ...collectorSlot.slotWheelOptions,
        getReleaseDueMs: oimGetReleaseDueAfterUnholdMs,
        setReleaseDueMs: oimSetReleaseDueAfterUnholdMs,
        releaseScheduledSlotFlag: OIM_SLOT_FLAG_RELEASE_SCHEDULED_AFTER_UNHOLD,
    });
}

import type { TOIMCollectorSlot } from '../types/TOIMCollectorSlot';
import { OIMSlotReleaseWheel } from '../OIMSlotReleaseWheel';
import { OIM_SLOT_FLAG_RELEASE_SCHEDULED_AFTER_UNHOLD } from '../constants/OIM_SLOT_FLAG_RELEASE_SCHEDULED_AFTER_UNHOLD';
import { peekOIMReleaseDueAfterUnholdMs } from '../../slot/utils/peekOIMReleaseDueAfterUnholdMs';
import { setOIMReleaseDueAfterUnholdMs } from '../../slot/utils/setOIMReleaseDueAfterUnholdMs';

export function mintOIMAfterUnholdSlotReleaseWheel(collectorSlot: TOIMCollectorSlot): OIMSlotReleaseWheel {
    return collectorSlot.afterUnholdSlotReleaseWheel ??= new OIMSlotReleaseWheel({
        ...collectorSlot.slotWheelOptions,
        getReleaseDueMs: peekOIMReleaseDueAfterUnholdMs,
        setReleaseDueMs: setOIMReleaseDueAfterUnholdMs,
        releaseScheduledSlotFlag: OIM_SLOT_FLAG_RELEASE_SCHEDULED_AFTER_UNHOLD,
    });
}

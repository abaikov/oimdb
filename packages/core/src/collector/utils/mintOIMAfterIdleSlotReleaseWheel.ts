import type { TOIMCollectorSlot } from '../types/TOIMCollectorSlot';
import { OIMSlotReleaseWheel } from '../OIMSlotReleaseWheel';
import { OIM_SLOT_FLAG_RELEASE_SCHEDULED_AFTER_IDLE } from '../constants/OIM_SLOT_FLAG_RELEASE_SCHEDULED_AFTER_IDLE';
import { peekOIMReleaseDueAfterIdleMs } from '../../slot/utils/peekOIMReleaseDueAfterIdleMs';
import { setOIMReleaseDueAfterIdleMs } from '../../slot/utils/setOIMReleaseDueAfterIdleMs';

export function mintOIMAfterIdleSlotReleaseWheel(collectorSlot: TOIMCollectorSlot): OIMSlotReleaseWheel {
    return collectorSlot.afterIdleSlotReleaseWheel ??= new OIMSlotReleaseWheel({
        ...collectorSlot.slotWheelOptions,
        getReleaseDueMs: peekOIMReleaseDueAfterIdleMs,
        setReleaseDueMs: setOIMReleaseDueAfterIdleMs,
        releaseScheduledSlotFlag: OIM_SLOT_FLAG_RELEASE_SCHEDULED_AFTER_IDLE,
    });
}

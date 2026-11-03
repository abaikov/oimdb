import type { TOIMCollectorSlot } from '../types/TOIMCollectorSlot';
import { OIMSlotReleaseWheel } from '../OIMSlotReleaseWheel';
import { OIM_SLOT_FLAG_RELEASE_SCHEDULED_AFTER_WRITE } from '../constants/OIM_SLOT_FLAG_RELEASE_SCHEDULED_AFTER_WRITE';
import { peekOIMReleaseDueAfterWriteMs } from '../../slot/utils/peekOIMReleaseDueAfterWriteMs';
import { setOIMReleaseDueAfterWriteMs } from '../../slot/utils/setOIMReleaseDueAfterWriteMs';

export function mintOIMAfterWriteSlotReleaseWheel(collectorSlot: TOIMCollectorSlot): OIMSlotReleaseWheel {
    return collectorSlot.afterWriteSlotReleaseWheel ??= new OIMSlotReleaseWheel({
        ...collectorSlot.slotWheelOptions,
        getReleaseDueMs: peekOIMReleaseDueAfterWriteMs,
        setReleaseDueMs: setOIMReleaseDueAfterWriteMs,
        releaseScheduledSlotFlag: OIM_SLOT_FLAG_RELEASE_SCHEDULED_AFTER_WRITE,
    });
}

import type { TOIMSlot } from '../slot/types/TOIMSlot';
import type { TOIMCollectorSlot } from './types/TOIMCollectorSlot';
import type { TOIMReleaseSlotCollectorSlot } from './types/TOIMReleaseSlotCollectorSlot';
import { OIMReleaseSlotCollectorService } from './OIMReleaseSlotCollectorService';
import { oimGetReleaseDueAfterIdleMs } from '../slot/utils/oimGetReleaseDueAfterIdleMs';
import { oimSetReleaseDueAfterIdleMs } from '../slot/utils/oimSetReleaseDueAfterIdleMs';

export class OIMReleaseSlotCollectorServiceAfterIdle extends OIMReleaseSlotCollectorService {
    public static readonly INSTANCE = new OIMReleaseSlotCollectorServiceAfterIdle();

    public readonly getReleaseDueMs: (slot: TOIMSlot) => number = oimGetReleaseDueAfterIdleMs;

    protected readonly setReleaseDueMs: (slot: TOIMSlot, releaseDueMs: number) => void = oimSetReleaseDueAfterIdleMs;

    public getReleaseSlotCollectorSlot(collectorSlot: TOIMCollectorSlot): TOIMReleaseSlotCollectorSlot {
        return collectorSlot.afterIdleReleaseSlotCollectorSlot;
    }
}

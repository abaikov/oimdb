import type { TOIMSlot } from '../slot/types/TOIMSlot';
import type { TOIMCollectorSlot } from './types/TOIMCollectorSlot';
import type { TOIMReleaseSlotCollectorSlot } from './types/TOIMReleaseSlotCollectorSlot';
import { OIMReleaseSlotCollectorService } from './OIMReleaseSlotCollectorService';
import { oimGetReleaseDueAfterUnholdMs } from '../slot/utils/oimGetReleaseDueAfterUnholdMs';
import { oimSetReleaseDueAfterUnholdMs } from '../slot/utils/oimSetReleaseDueAfterUnholdMs';

export class OIMReleaseSlotCollectorServiceAfterUnhold extends OIMReleaseSlotCollectorService {
    public static readonly INSTANCE = new OIMReleaseSlotCollectorServiceAfterUnhold();

    public readonly getReleaseDueMs: (slot: TOIMSlot) => number = oimGetReleaseDueAfterUnholdMs;

    protected readonly setReleaseDueMs: (slot: TOIMSlot, releaseDueMs: number) => void = oimSetReleaseDueAfterUnholdMs;

    public getReleaseSlotCollectorSlot(collectorSlot: TOIMCollectorSlot): TOIMReleaseSlotCollectorSlot {
        return collectorSlot.afterUnholdReleaseSlotCollectorSlot;
    }
}

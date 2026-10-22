import type { TOIMSlot } from '../slot/types/TOIMSlot';
import type { TOIMCollectorSlot } from './types/TOIMCollectorSlot';
import type { TOIMReleaseSlotCollectorSlot } from './types/TOIMReleaseSlotCollectorSlot';
import { OIMReleaseSlotCollectorService } from './OIMReleaseSlotCollectorService';
import { oimGetReleaseDueAfterWriteMs } from '../slot/utils/oimGetReleaseDueAfterWriteMs';
import { oimSetReleaseDueAfterWriteMs } from '../slot/utils/oimSetReleaseDueAfterWriteMs';

export class OIMReleaseSlotCollectorServiceAfterWrite extends OIMReleaseSlotCollectorService {
    public static readonly INSTANCE = new OIMReleaseSlotCollectorServiceAfterWrite();

    public readonly getReleaseDueMs: (slot: TOIMSlot) => number = oimGetReleaseDueAfterWriteMs;

    protected readonly setReleaseDueMs: (slot: TOIMSlot, releaseDueMs: number) => void = oimSetReleaseDueAfterWriteMs;

    public getReleaseSlotCollectorSlot(collectorSlot: TOIMCollectorSlot): TOIMReleaseSlotCollectorSlot {
        return collectorSlot.afterWriteReleaseSlotCollectorSlot;
    }
}

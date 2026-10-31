import type { OIMDB, OIMSourceTracker, TOIMSlot, TOIMComputedContentSlot } from '@oimdb/core';
import { createOIMSingleComputedService, createOIMSingleSourceTrackingComputedService } from '@oimdb/core';

export function computed<TValue>(
    db: OIMDB,
    derive: () => TValue,
    sourceSlots?: readonly (TOIMSlot & { readonly value?: never })[],
): TOIMComputedContentSlot<TValue, OIMSourceTracker | undefined> {
    if (sourceSlots === undefined) {
        const sourceTrackingComputedService = createOIMSingleSourceTrackingComputedService<TValue>({ derive, initialValue: undefined as TValue });
        return sourceTrackingComputedService.computedSingleSlotService.holdSingleSlot(sourceTrackingComputedService.createComputedStoreSlot(db));
    }
    const computedService = createOIMSingleComputedService<TValue>({ createSources: () => ({ sourceSlots }), derive, initialValue: undefined as TValue });
    return computedService.computedSingleSlotService.holdSingleSlot(computedService.createComputedStoreSlot(db));
}

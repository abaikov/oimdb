import type { TOIMComputedContentSlot } from '../types/TOIMComputedContentSlot';
import type { OIMSourceTracker } from '../OIMSourceTracker';

export function oimRefreshSourceComputeds(sourceComputeds: readonly TOIMComputedContentSlot<unknown, OIMSourceTracker | undefined>[]): void {
    for (let i = 0; i < sourceComputeds.length; i++) {
        const sourceComputedSlot = sourceComputeds[i];
        sourceComputedSlot.computedValueService.getValueForSlot(sourceComputedSlot);
    }
}

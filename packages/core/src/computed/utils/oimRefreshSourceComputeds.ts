import type { OIMComputedSlot } from '../OIMComputedSlot';
import type { TOIMComputedContentSlot } from '../types/TOIMComputedContentSlot';
import type { OIMSourceTracker } from '../OIMSourceTracker';

export function oimRefreshSourceComputeds(sourceComputeds: readonly TOIMComputedContentSlot<unknown, OIMSourceTracker | undefined>[]): void {
    for (let i = 0; i < sourceComputeds.length; i++) {
        const sourceComputedSlot = sourceComputeds[i];
        (sourceComputedSlot as unknown as OIMComputedSlot<unknown>).computedValueService.getValueForSlot(sourceComputedSlot);
    }
}

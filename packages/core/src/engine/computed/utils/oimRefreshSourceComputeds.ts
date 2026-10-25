import type { TOIMComputedContentSlot } from '../types/TOIMComputedContentSlot';

export function oimRefreshSourceComputeds(sourceComputeds: readonly TOIMComputedContentSlot[]): void {
    for (let i = 0; i < sourceComputeds.length; i++) {
        const sourceComputedSlot = sourceComputeds[i];
        sourceComputedSlot.computedValueService.getValueForSlot(sourceComputedSlot);
    }
}

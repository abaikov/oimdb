import type { TOIMComputedSlot } from '../types/TOIMComputedSlot';

export function oimRefreshSourceComputeds(sourceComputeds: readonly TOIMComputedSlot[]): void {
    for (let i = 0; i < sourceComputeds.length; i++) {
        const sourceComputedSlot = sourceComputeds[i];
        sourceComputedSlot.computedValueService.getValueForSlot(sourceComputedSlot);
    }
}

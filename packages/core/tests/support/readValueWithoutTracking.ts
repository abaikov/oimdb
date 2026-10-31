import type { OIMComputedSlot } from '../../src/computed/OIMComputedSlot';
import type { OIMSourceTracker } from '../../src/computed/OIMSourceTracker';
import type { TOIMComputedContentSlot } from '../../src/computed/types/TOIMComputedContentSlot';

export const readValueWithoutTracking = <TValue>(computedSlot: TOIMComputedContentSlot<TValue, OIMSourceTracker | undefined>): TValue =>
    (computedSlot as unknown as OIMComputedSlot<TValue, NonNullable<unknown>, OIMSourceTracker | undefined>).computedValueService.getValueForSlot(computedSlot);

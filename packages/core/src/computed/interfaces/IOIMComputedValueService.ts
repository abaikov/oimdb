import type { TOIMComputedContentSlot } from '../types/TOIMComputedContentSlot';
import type { OIMSourceTracker } from '../OIMSourceTracker';

export interface IOIMComputedValueService<TValue = unknown> {
    getValueForSlot(computedSlot: TOIMComputedContentSlot<TValue, OIMSourceTracker | undefined>): TValue;
}

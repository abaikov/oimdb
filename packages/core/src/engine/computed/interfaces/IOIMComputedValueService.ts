import type { TOIMComputedContentSlot } from '../types/TOIMComputedContentSlot';

export interface IOIMComputedValueService<TValue = unknown> {
    getValueForSlot(computedSlot: TOIMComputedContentSlot<TValue>): TValue;
}

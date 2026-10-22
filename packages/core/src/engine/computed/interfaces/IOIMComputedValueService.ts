import type { TOIMComputedSlot } from '../types/TOIMComputedSlot';

export interface IOIMComputedValueService<TValue = unknown> {
    getValueForSlot(computedSlot: TOIMComputedSlot<TValue>): TValue;
}

import type { TOIMSameValueGuard } from '../../slot/types/TOIMSameValueGuard';
import type { TOIMComputedSlot } from './TOIMComputedSlot';

export type TOIMComputedValueServiceOptions<TKey, TValue> = {
    derive?: ((computedSlot: TOIMComputedSlot<TValue, TKey>) => TValue) | undefined;
    sameValueGuard?: TOIMSameValueGuard<TValue> | undefined;
};

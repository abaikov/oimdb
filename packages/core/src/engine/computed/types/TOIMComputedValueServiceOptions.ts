import type { TOIMSameValueGuard } from '../../slot/types/TOIMSameValueGuard';
import type { TOIMComputedContentSlot } from './TOIMComputedContentSlot';

export type TOIMComputedValueServiceOptions<TValue, TComputedSlot extends TOIMComputedContentSlot<TValue>> = {
    derive?: ((computedSlot: TComputedSlot) => TValue) | undefined;
    sameValueGuard?: TOIMSameValueGuard<TValue> | undefined;
};

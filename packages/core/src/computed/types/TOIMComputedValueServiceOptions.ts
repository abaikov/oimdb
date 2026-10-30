import type { TOIMSameValueGuard } from '../../slot/types/TOIMSameValueGuard';
import type { TOIMComputedContentSlot } from './TOIMComputedContentSlot';
import type { TOIMComputedValueReleaser } from './TOIMComputedValueReleaser';
import type { OIMSourceTracker } from '../OIMSourceTracker';

export type TOIMComputedValueServiceOptions<TValue, TComputedSlot extends TOIMComputedContentSlot<TValue, OIMSourceTracker | undefined>> = {
    derive?: ((computedSlot: TComputedSlot) => TValue) | undefined;
    sameValueGuard?: TOIMSameValueGuard<TValue> | undefined;
    releaseValue?: TOIMComputedValueReleaser<TValue> | undefined;
};

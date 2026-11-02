import type { OIMComputedValueService } from '../OIMComputedValueService';
import type { TOIMComputedContentSlot } from './TOIMComputedContentSlot';
import type { OIMSourceTracker } from '../OIMSourceTracker';

export type TOIMComputedContentServiceOptions<TValue, TComputedSlot extends TOIMComputedContentSlot<TValue, OIMSourceTracker | undefined>> = {
    computedValueService: OIMComputedValueService<TValue, TComputedSlot>;
    initialValue?: TValue | undefined;
};

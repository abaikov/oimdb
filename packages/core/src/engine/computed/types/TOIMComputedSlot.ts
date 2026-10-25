import type { TOIMIndexableSlot } from '../../slot/types/TOIMIndexableSlot';
import type { TOIMComputedContentSlot } from './TOIMComputedContentSlot';

export type TOIMComputedSlot<TValue = unknown, TKey extends NonNullable<unknown> = NonNullable<unknown>> =
    TOIMComputedContentSlot<TValue> & TOIMIndexableSlot<TKey>;

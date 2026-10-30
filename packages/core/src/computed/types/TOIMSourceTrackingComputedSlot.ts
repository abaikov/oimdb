import type { TOIMComputedSlot } from './TOIMComputedSlot';
import type { OIMSourceTracker } from '../OIMSourceTracker';

export type TOIMSourceTrackingComputedSlot<TValue = unknown, TKey extends NonNullable<unknown> = NonNullable<unknown>> =
    TOIMComputedSlot<TValue, TKey, OIMSourceTracker>;

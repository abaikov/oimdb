import type { OIMSourceTracker } from '../OIMSourceTracker';

export type TOIMSourceTrackingComputedDerive<TValue, TComputedSlot> = (computedSlot: TComputedSlot, sourceTracker: OIMSourceTracker) => TValue;

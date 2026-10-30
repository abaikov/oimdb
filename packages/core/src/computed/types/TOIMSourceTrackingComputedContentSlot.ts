import type { TOIMComputedContentSlot } from './TOIMComputedContentSlot';
import type { OIMSourceTracker } from '../OIMSourceTracker';

export type TOIMSourceTrackingComputedContentSlot<TValue = unknown> = TOIMComputedContentSlot<TValue, OIMSourceTracker>;

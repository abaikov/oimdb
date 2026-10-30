import type { OIMSourceTracker } from '../../computed/OIMSourceTracker';

export type TOIMSourceTrackingEffectBody = (sourceTracker: OIMSourceTracker) => (() => void) | void;

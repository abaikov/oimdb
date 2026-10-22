import type { OIMEffectSourceTracker } from '../OIMEffectSourceTracker';

export type TOIMEffectBodyWithSourceTracking = (effectSourceTracker: OIMEffectSourceTracker) => (() => void) | void;

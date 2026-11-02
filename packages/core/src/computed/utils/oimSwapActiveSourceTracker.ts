import type { IOIMSourceTracker } from '../interfaces/IOIMSourceTracker';
import { OIM_ACTIVE_SOURCE_TRACKER } from '../constants/OIM_ACTIVE_SOURCE_TRACKER';

export function oimSwapActiveSourceTracker(sourceTracker: IOIMSourceTracker | undefined): IOIMSourceTracker | undefined {
    const outerSourceTracker = OIM_ACTIVE_SOURCE_TRACKER.sourceTracker;
    OIM_ACTIVE_SOURCE_TRACKER.sourceTracker = sourceTracker;
    return outerSourceTracker;
}

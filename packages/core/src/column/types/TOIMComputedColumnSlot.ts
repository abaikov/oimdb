import type { TOIMComputedContentSlot } from '../../computed/types/TOIMComputedContentSlot';
import type { TOIMKeyedSlot } from '../../slot/types/TOIMKeyedSlot';
import type { OIMSourceTracker } from '../../computed/OIMSourceTracker';

export type TOIMComputedColumnSlot<TSourceTracker extends OIMSourceTracker | undefined = OIMSourceTracker | undefined> =
    TOIMComputedContentSlot<unknown, TSourceTracker> & TOIMKeyedSlot<string> & {
        readonly carrierSlot: TOIMComputedContentSlot<unknown, TSourceTracker>;
    };

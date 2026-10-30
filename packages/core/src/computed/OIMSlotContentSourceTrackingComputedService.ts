import type { TOIMSourceTrackingComputedContentSlot } from './types/TOIMSourceTrackingComputedContentSlot';
import { OIMSlotContentComputedService } from './OIMSlotContentComputedService';
import { OIMSourceTracker } from './OIMSourceTracker';

export class OIMSlotContentSourceTrackingComputedService<
    TValue, TComputedSlot extends TOIMSourceTrackingComputedContentSlot<TValue> = TOIMSourceTrackingComputedContentSlot<TValue>,
> extends OIMSlotContentComputedService<TValue, TComputedSlot> {
    protected override createSourceTracker(): OIMSourceTracker {
        return new OIMSourceTracker();
    }

    protected override attachSources(): void {
        return;
    }
}

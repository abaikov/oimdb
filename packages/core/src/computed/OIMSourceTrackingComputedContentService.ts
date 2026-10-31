import type { TOIMSourceTrackingComputedContentSlot } from './types/TOIMSourceTrackingComputedContentSlot';
import { OIMComputedContentService } from './OIMComputedContentService';
import { OIMSourceTracker } from './OIMSourceTracker';

export class OIMSourceTrackingComputedContentService<
    TValue, TComputedSlot extends TOIMSourceTrackingComputedContentSlot<TValue> = TOIMSourceTrackingComputedContentSlot<TValue>,
> extends OIMComputedContentService<TValue, TComputedSlot> {
    protected override createSourceTracker(): OIMSourceTracker {
        return new OIMSourceTracker();
    }

    protected override attachSources(): void {
        return;
    }
}

import type { TOIMSourceTrackingComputedContentSlot } from './types/TOIMSourceTrackingComputedContentSlot';
import type { TOIMComputedContentServiceOptions } from './types/TOIMComputedContentServiceOptions';
import { OIMComputedContentService } from './OIMComputedContentService';
import { OIMSourceTracker } from './OIMSourceTracker';

export class OIMSourceTrackingComputedContentService<
    TValue, TComputedSlot extends TOIMSourceTrackingComputedContentSlot<TValue> = TOIMSourceTrackingComputedContentSlot<TValue>,
> extends OIMComputedContentService<TValue, TComputedSlot> {
    public constructor(options: TOIMComputedContentServiceOptions<TValue, TComputedSlot>) {
        super(options);
    }

    protected override createSourceTracker(): OIMSourceTracker {
        return new OIMSourceTracker();
    }
}
